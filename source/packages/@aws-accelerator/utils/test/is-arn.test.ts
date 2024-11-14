import { describe, expect, test } from '@jest/globals';
import { isArn } from '../lib/is-arn';

const validArns = [
  'arn:aws:iam::123456789012:user/johndoe',
  'arn:aws:network-firewall:ap-southeast-2:123456789012:firewall-policy/central-egress-nfw-policy',
];

const invalidArns = ['abcd', '', 'http://www.test.com:8080', 'test:aws:iam::123456789012:user/johndoe'];

describe('function isArn', () => {
  describe('should return true for valid arn', () => {
    validArns.forEach(arn =>
      test(arn, () => {
        expect(isArn(arn)).toBe(true);
      }),
    );
  });
  describe('should return false for invalid arn', () => {
    invalidArns.forEach(arn =>
      test(arn, () => {
        expect(isArn(arn)).toBe(false);
      }),
    );
  });
});
