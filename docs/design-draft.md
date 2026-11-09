## Technical spec
- Node.js
- Nestjs
- PostgreSQL
- TypeORM
- Jest


## API
Decisions and their rationale are recorded in `docs/decisions.md` (ADR numbers in brackets). Spec: `docs/backend-challenge.md`.

Common rules:
  - snake_case in requests and responses [ADR-07]
  - money and yield are decimal strings with at most 2 decimals; size/shares are integers [ADR-07]
  - path id matches ^[1-9]\d*$ and is <= 2147483647, otherwise 400 [ADR-02]
  - 400 malformed request (DTO), 404 user not found, 422 business rule violated (nothing persisted), 201 + REJECTED valid order without enough cash/shares [ADR-03]

### /users/:id/portfolio
Method: GET

Params:
  - path:
    - id: user id

Response status:
  - 200: success
  - 404: user not found
  - 400: bad request

Response body:
  - account_number
  - available
  - total_cash
  - total_value
  - assets (Array):
    - instrument_id
    - ticker
    - name
    - shares
    - value ($)
    - yield (%)

Considerations:
  - id has valid format
  - user id exists
  - a user with no orders returns 200 with zeros and an empty assets list
  - positions with 0 shares are not listed
  - total_value = total_cash + sum(shares * last close); NEW orders don't affect it


### /assets
Method: GET

Params:
  - query:
    - name: asset name
    - ticker: asset ticker
    - page: default 1
    - limit: default 20, max 100

Response status:
  - 200: success
  - 400: bad request

Response body:
  - data (Array):
    - id
    - ticker
    - name
    - type
    - last_close (null when the instrument has no marketdata)
  - total
  - page
  - limit

Considerations:
  - no params returns the first page
  - only accepts params name, ticker, page and limit, otherwise 400
  - the search is a case-insensitive partial match, accents are not handled
  - name and ticker combine with AND; empty strings are ignored
  - ARS (type MONEDA) is excluded
  - sorted by ticker
  - when search criteria is not matched (or the page is past the end) returns data: [] with 200 [ADR-08]

### /users/:id/orders
Method: POST

Params:
  - path:
    - id: user id

Request body:
  - instrument_id
  - side
  - type
  - size?
  - price?
  - amount?

Response status:
  - 201: success (including orders persisted as REJECTED)
  - 404: user (path id) not found
  - 422: business rule violated, nothing persisted
  - 400: bad request

Response body:
  - id
  - instrument_id
  - user_id
  - side
  - size
  - price
  - type
  - status
  - rejection_reason (null unless REJECTED)
  - datetime

Considerations:
  - 400 (DTO): types, required fields, format, price/amount/size > 0, at most 2 decimals, values within INT / NUMERIC(10,2) range, enums in exact uppercase
  - 400: if type == LIMIT then price is required
  - 400: a request with type MARKET and price
  - 400: amount and size cannot be sent together; not sending either
  - when amount is sent it is the same as sending size=Math.floor(amount/price); for MARKET the price is the last close
  - 422: instrument_id does not exist
  - 422: side CASH_IN/CASH_OUT with a non-ARS instrument, or ARS with side BUY/SELL
  - 422: instrument without marketdata (MARKET and LIMIT)
  - 422: amount results in 0 shares (MARKET and LIMIT)
  - cash orders (CASH_IN/CASH_OUT) are MARKET only, price forced to 1; CASH_OUT above available is REJECTED
  - MARKET orders are FILLED at the last close (latest date), the price is stored even if REJECTED
  - LIMIT orders are NEW
  - not enough cash (BUY) or shares (SELL) returns 201 with status REJECTED and rejection_reason
  - check order: 400 -> 404 -> 422 -> balance check under the user row lock -> NEW/FILLED/REJECTED [ADR-04, ADR-12]

## Domain
- orders with status NEW reserve available cash (BUY) or shares (SELL) but don't add/subtract to an user's total cash or positions
- orders with CANCELLED or REJECTED status don't affect an user's portfolio
- a POST /users/:id/orders/:order_id/cancel endpoint is missing to cancel a user's NEW order and restore the reservation (not part of the challenge but could add it at the end) [ADR-19]
- i'm not supposed to simulate the market so orders with status NEW stay unchanged.
- REJECTED orders don't affect an user's portfolio, the validation is ran before the asset amounts are updated
- total_cash = sum(size*price) of FILLED orders, adding CASH_IN and SELL, subtracting CASH_OUT and BUY
- available = total_cash - sum(size*price) of NEW BUY orders
- available shares of an asset = FILLED buys - FILLED sells - NEW sells; a SELL is validated against this
- the yield of an asset is unrealized: (shares * last close) vs (shares * weighted average cost), where the average cost is a running average over the user's FILLED orders sorted by datetime, id (a BUY updates it, a SELL keeps it). Not a plain sum(cost)/sum(shares), which is wrong after sells.
- last close = close of the marketdata row with the latest date


Example (hypothetical, it is NOT the seed data; order 11 here is an extra BUY used to show weighted cost across two prices. The seed's order 11 is a BMA SELL, see ADR-16):

	Instrumento	Side	Size × Price	Type	Status	
1	ARS	CASH_IN	1.000.000 × 1	MARKET	FILLED	
2	PAMP	BUY	50 × 930	MARKET	FILLED	
3	PAMP	BUY	50 × 920	LIMIT	CANCELLED	
4	PAMP	SELL	10 × 940	MARKET	FILLED	
5	LOMA	BUY	50 × 710	LIMIT	NEW
6	PAMP	SELL	100 × 950	MARKET	REJECTED	
7	BMA	BUY	60 × 1500	LIMIT	NEW	
8	ARS	CASH_OUT	100.000 × 1	MARKET	FILLED	
9	BMA	BUY	20 × 1540	LIMIT	FILLED
10	METR	BUY	500 × 250	MARKET	FILLED
11	PAMP	BUY	20 × 950	MARKET	FILLED	

1:
  total_cash: 1000000
  available_cash: 1000000
  
  asset [size  price]

2:
  total_cash: 953500
  available_cash: 953500
  
  asset [size  price]
  PAMP  [50  930] 

3: unchanged because CANCELLED

4:
  total_cash: 962900
  available_cash: 962900
  
  asset [size  price]
  PAMP [40 930]

5:
  total_cash: 962900
  available_cash: 927400

  asset [size  price]
  PAMP [40 930]

6: unchanged because REJECTED

7:
  total_cash: 962900
  available_cash: 837400
  
  asset [size  price]
  PAMP [40 930] 

8:
  total_cash: 862900
  available_cash: 737400

  asset [size  price]
  PAMP [40 930] 

9:
  total_cash: 832100
  available_cash: 706600

  asset [size  price]
  PAMP [40 930] 
  BMA [20  1540]

10:
  total_cash: 707100
  available_cash: 581600
  
  asset [size  price]
  PAMP [40 930] 
  BMA [20  1540]
  METR  [500 250]

11:
  total_cash: 688100
  available_cash: 562600
  
  asset [size  price]
  PAMP [40 930, 20 950] 
  BMA [20  1540]
  METR  [500 250]


total_cash: 688100
available_cash: 562600

for PAMP:
  (1): 40*930 + 20*950
  (2): 60*(last close value for PAMP)

for last close value for PAMP = 960:

  yield = 57600 - 56200 = 1400 or +2.49%

for last close value for PAMP = 900:

  yield = 54000 - 56200 = -2200 or -3.91%
