## Technical spec
- Node.js
- Nestjs
- PostgreSQL
- TypeORM
- Jest


## API
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


### /assets
Method: GET

Params:
  - query:
    - name: asset name
    - ticker: asset ticker
  
Response status:
  - 200: success
  - 400: bad request

Response body (Array):
  - id
  - ticker
  - name
  - type
  - last_close
  
Considerations:
  - no params returns all the assets
  - only accepts params name and ticker
  - the search is partial match
  - when search criteria is not matched returns [] with 200

### /orders
Method: POST

Request body:
  - instrument_id
  - user_id (better to retrieve from token?)
  - side
  - size?
  - price?
  - type
  - amount?
  
Response status:
  - 201: success
  - 404: asset (instrument_id) or user (user_id) not found
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
  - datetime

Considerations:
  - body schema validation (size, amount and price > 0)
  - instrument id exists
  - user id exist
  - if type == LIMIT then price is required
  - amount and size cannot be sent together, when amount is sent it it should be the same as sending size=Math.floor(amount/price). not sending either returns a 400
  - a request that results in a REJECTED order returns a 201
  - a request with type MARKET and price returns a 400
  - if side is CASH_IN or CASH_OUT instrument_id must be of ARS, otherwise 400
  - if instrument_id is ARS side must be CASH_IN or CASH_OUT, otherwise 400

## Domain
- orders with status NEW reserve available cash/shares but doesn't add/substract to an user's portfolio
- orders with CANCELLED or REJECTED status don't affect an user's portfolio
- a /orders/:id/cancel enpoint is missing to cancel a user's order and restore the order cash (not part of the challenge but could add it at the end)
- i'm not supposed to simulate the market so orders with status NEW stay unchanged.
- REJECTED orders don't affect an user's portfolio, the validation is ran before the asset amounts are updated
- to calculate the available cash for an user i have to add the orders.size*orders.price when side is CASH_IN, SELL and substract all the orders.size*orders.price when side is CASH_OUT, BUY. when the order.status is NEW (for side BUY) or FILLED (for side SELL)
- to calculate the total cash for an user i have to add the orders.size*orders.price when side is CASH_IN, SELL and substract all the orders.size*orders.price when side is CASH_OUT, BUY. when the order.status is FILLED
- to calculate the yield for an user's asset i have to compare for all orders the value of that asset at the moment of placing the order (1) vs the current value of that asset (2).


Example:

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
