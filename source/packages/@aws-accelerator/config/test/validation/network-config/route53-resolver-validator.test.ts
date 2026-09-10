import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Route53ResolverValidator } from '../../../validator/network-config-validator/route53-resolver-validator';
import { NetworkConfig, ResolverEndpointConfig } from '../../../lib/network-config';
import { NetworkValidatorFunctions } from '../../../validator/network-config-validator/network-validator-functions';

describe('Route53ResolverValidator', () => {
  let validator: Route53ResolverValidator;
  let errors: string[];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    const networkConfig = {} as NetworkConfig;
    const ouIdNames: string[] = ['Root'];
    const helpers = new NetworkValidatorFunctions(networkConfig, ouIdNames, [], [], ['us-east-1']);

    validator = new Route53ResolverValidator(networkConfig, './', helpers, []);
    errors = [];
  });

  describe('validateResolverProtocols', () => {
    let validateSpy: vi.SpyInstance;

    it('calls inbound', () => {
      const endpoint = {
        type: 'INBOUND',
      } as ResolverEndpointConfig;
      validateSpy = vi.spyOn(validator, 'validateInboundResolverEndpoint' as keyof Route53ResolverValidator);
      validator['validateResolverProtocols'](endpoint, errors);
      expect(validateSpy).toHaveBeenLastCalledWith(endpoint, errors);
    });

    it('calls outbound', () => {
      const endpoint = {
        type: 'OUTBOUND',
      } as ResolverEndpointConfig;
      validateSpy = vi.spyOn(validator, 'validateOutboundResolverEndpoint' as keyof Route53ResolverValidator);
      validator['validateResolverProtocols'](endpoint, errors);
      expect(validateSpy).toHaveBeenLastCalledWith(endpoint, errors);
    });
  });

  describe('validateInboundResolverEndpoint', () => {
    it('undefined protocol creates no error', () => {
      const endpoint = {} as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH is allowed', () => {
      const endpoint = {
        protocols: ['DoH'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH-FIPS is allowed', () => {
      const endpoint = {
        protocols: ['DoH-FIPS'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH-FIPS and Do53 is allowed', () => {
      const endpoint = {
        protocols: ['DoH-FIPS', 'Do53'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH and Do53 is allowed', () => {
      const endpoint = {
        protocols: ['DoH', 'Do53'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('Do53 is allowed', () => {
      const endpoint = {
        protocols: ['Do53'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH and FIPS creates error', () => {
      const endpoint = {
        protocols: ['DoH', 'DoH-FIPS'],
      } as ResolverEndpointConfig;
      validator['validateInboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(1);
    });
  });

  describe('validateOutboundResolverEndpoint', () => {
    it('not doh-fips is allowed', () => {
      const endpoint = {
        protocols: ['Do53', 'DoH'],
      } as ResolverEndpointConfig;
      validator['validateOutboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(0);
    });

    it('DoH-FIPS is not allowed', () => {
      const endpoint = {
        protocols: ['Do53', 'DoH-FIPS'],
      } as ResolverEndpointConfig;
      validator['validateOutboundResolverEndpoint'](endpoint, errors);

      expect(errors).toHaveLength(1);
    });
  });

  describe('validateForwardRuleNames', () => {
    const helpers = new NetworkValidatorFunctions({} as NetworkConfig, ['Root'], [], [], ['us-east-1']);

    it('flags a rule name duplicated across a central and a VPC-level endpoint', () => {
      const values = {
        centralNetworkServices: {
          route53Resolver: {
            endpoints: [{ name: 'central-outbound', type: 'OUTBOUND', rules: [{ name: 'dup-rule' }] }],
          },
        },
        vpcs: [
          {
            name: 'workload',
            vpcRoute53Resolver: {
              endpoints: [{ name: 'vpc-outbound', type: 'OUTBOUND', rules: [{ name: 'dup-rule' }] }],
            },
          },
        ],
      } as unknown as NetworkConfig;

      validator['validateForwardRuleNames'](values, helpers, errors);

      expect(errors.some(e => e.includes('Resolver FORWARD rules has duplicates'))).toBe(true);
    });

    it('accepts unique rule names across central and VPC-level endpoints', () => {
      const values = {
        centralNetworkServices: {
          route53Resolver: {
            endpoints: [{ name: 'central-outbound', type: 'OUTBOUND', rules: [{ name: 'central-rule' }] }],
          },
        },
        vpcs: [
          {
            name: 'workload',
            vpcRoute53Resolver: {
              endpoints: [{ name: 'vpc-outbound', type: 'OUTBOUND', rules: [{ name: 'vpc-rule' }] }],
            },
          },
        ],
      } as unknown as NetworkConfig;

      validator['validateForwardRuleNames'](values, helpers, errors);

      expect(errors).toHaveLength(0);
    });
  });
});
