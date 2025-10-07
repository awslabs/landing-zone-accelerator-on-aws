const arnPattern = /^arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:[0-9]{12}:[a-zA-Z0-9-_:/]+/;

export const isArn = (value: unknown): boolean => typeof value === 'string' && arnPattern.test(value);
