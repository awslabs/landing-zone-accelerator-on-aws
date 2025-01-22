import { Validator } from 'ip-num/Validator';

export const isIpV4 = (value: unknown) => typeof value === 'string' && Validator.isValidIPv4String(value)[0];

export const isIpV6 = (value: unknown) => typeof value === 'string' && Validator.isValidIPv6String(value)[0];
