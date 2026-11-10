import { registerDecorator, type ValidationArguments } from 'class-validator';

export function InvalidWhen<T extends object>(
  predicate: (dto: T) => boolean,
  message: string,
) {
  return (target: object, propertyName: string): void => {
    registerDecorator({
      name: 'invalidWhen',
      target: target.constructor,
      propertyName,
      validator: {
        validate: (_value: unknown, args: ValidationArguments) =>
          !predicate(args.object as T),
        defaultMessage: () => message,
      },
    });
  };
}
