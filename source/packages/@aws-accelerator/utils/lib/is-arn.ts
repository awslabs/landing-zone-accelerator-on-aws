const arnPattern = /^arn:aws:([a-zA-Z0-9-])+:([a-z]{2}-[a-z]+-\d{1})?:(\d{12})?:(.+)$/;

export const isArn = (value: unknown): boolean => typeof value === 'string' && arnPattern.test(value);
