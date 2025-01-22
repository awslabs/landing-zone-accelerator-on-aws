import { isIpV4, isIpV6 } from '../../../validator/common/ip-address-validation';

describe('isIpV4', () => {
  const valid: unknown[] = ['192.168.0.1'];
  const invalid: unknown[] = ['123.456.789.123', 123];
  valid.forEach(ip =>
    it(`should return true for IP '${ip}'`, () => {
      expect(isIpV4(ip)).toBe(true);
    }),
  );
  invalid.forEach(ip =>
    it(`should return false for IP '${ip}'`, () => {
      expect(isIpV4(ip)).toBe(false);
    }),
  );
});

describe('isIpV6', () => {
  const valid: unknown[] = ['2001:db8:3333:4444:5555:6666:7777:8888', '2001:db8:1:ffff:ffff:ffff:ffff:fffe'];
  const invalid: unknown[] = [123512, new Date(), '2001.db8.3333.4444.5555.6666.7777.8888'];
  valid.forEach(ip =>
    it(`should return true for IP '${ip}'`, () => {
      expect(isIpV6(ip)).toBe(true);
    }),
  );
  invalid.forEach(ip =>
    it(`should return false for IP '${ip}'`, () => {
      expect(isIpV6(ip)).toBe(false);
    }),
  );
});
