import {
  DetectorFeature,
  FeatureAdditionalConfiguration,
  FindingPublishingFrequency,
  GuardDutyClient,
  UpdateDetectorCommand,
  UpdateMalwareScanSettingsCommand,
  UpdateMemberDetectorsCommand,
} from '@aws-sdk/client-guardduty';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  createAdditionalConfiguration,
  createDetectorFeatures,
  createFeature,
  removeDetectorFeatures,
  setOptions,
  UpdateDetectorOptions,
  updateMainDetector,
  updateMemberDetectors,
} from '../index';

describe('GuardDutyUpdateDetector - lambda handler', () => {
  let guardDutyClient: GuardDutyClient;
  let updateOptions: UpdateDetectorOptions;
  const detectorId = 'test-detector';
  const existingMemberAccountIds = ['1234567890'];

  beforeEach(() => {
    jest.clearAllMocks();
    guardDutyClient = new GuardDutyClient();
    updateOptions = {
      enableEksProtection: true,
      enableEksAgent: true,
      enableS3Protection: true,
      enableEc2Protection: true,
      enableRdsProtection: true,
      enableLambdaProtection: true,
      enableKeepMalwareSnapshots: true,
    };
  });

  describe('createAdditionalConfiguration', () => {
    test('EC2 and enabled', () => {
      const feature = FeatureAdditionalConfiguration.EC2_AGENT_MANAGEMENT;
      const result = createAdditionalConfiguration(feature, true);

      expect(result.Name).toEqual(feature);
      expect(result.Status).toEqual('ENABLED');
    });

    test('EKS and disabled', () => {
      const feature = FeatureAdditionalConfiguration.EKS_ADDON_MANAGEMENT;
      const result = createAdditionalConfiguration(feature, false);

      expect(result.Name).toEqual(feature);
      expect(result.Status).toEqual('DISABLED');
    });
  });

  describe('createFeature', () => {
    test('S3 and enabled', () => {
      const feature = DetectorFeature.S3_DATA_EVENTS;
      const result = createFeature(feature, true);

      expect(result.Name).toEqual(feature);
      expect(result.Status).toEqual('ENABLED');
    });

    test('EKS and disabled', () => {
      const feature = DetectorFeature.EKS_AUDIT_LOGS;
      const result = createFeature(feature, false);

      expect(result.Name).toEqual(feature);
      expect(result.Status).toEqual('DISABLED');
    });
  });

  describe('createDetectorFeatures', () => {
    test('EKS and Agent', () => {
      const options: UpdateDetectorOptions = {
        enableEksProtection: true,
        enableEksAgent: true,
        enableS3Protection: false,
        enableEc2Protection: false,
        enableRdsProtection: false,
        enableLambdaProtection: false,
        enableKeepMalwareSnapshots: false,
      };
      const result = createDetectorFeatures(options);
      expect(result).toHaveLength(6);
      const eksResult = result.find(element => element.Name === DetectorFeature.EKS_RUNTIME_MONITORING);
      expect(eksResult).not.toBeUndefined();
      expect(eksResult!.Status).toBe('ENABLED');
      expect(eksResult!.AdditionalConfiguration).toHaveLength(1);
      expect(eksResult!.AdditionalConfiguration![0].Name).toBe(FeatureAdditionalConfiguration.EKS_ADDON_MANAGEMENT);
      expect(eksResult!.AdditionalConfiguration![0].Status).toBe('ENABLED');
    });

    test('All detector options disabled', () => {
      const options: UpdateDetectorOptions = {
        enableEksProtection: false,
        enableEksAgent: false,
        enableS3Protection: false,
        enableEc2Protection: false,
        enableRdsProtection: false,
        enableLambdaProtection: false,
        enableKeepMalwareSnapshots: false,
      };
      const result = createDetectorFeatures(options);
      expect(result).toHaveLength(6);

      result.forEach(function (element) {
        expect(element.Status).toBe('DISABLED');
        expect(element.AdditionalConfiguration).toBeUndefined();
      });
    });

    test('All detector options enabled', () => {
      const result = createDetectorFeatures(updateOptions);
      expect(result).toHaveLength(6);

      result.forEach(function (element) {
        expect(element.Status).toBe('ENABLED');
        if (element.Name === DetectorFeature.EKS_RUNTIME_MONITORING) {
          expect(element.AdditionalConfiguration).toHaveLength(1);
        } else expect(element.AdditionalConfiguration).toBeUndefined();
      });
    });
  });

  describe('setOptions', () => {
    test('FIFTEEN_MINUTES export frequency', () => {
      const map = {
        exportFrequency: 'FIFTEEN_MINUTES',
      };
      const result = setOptions(map);
      expect(result.exportFrequency).toBe(FindingPublishingFrequency.FIFTEEN_MINUTES);
    });

    test('ONE_HOUR export frequency', () => {
      const map = {
        exportFrequency: 'ONE_HOUR',
      };
      const result = setOptions(map);
      expect(result.exportFrequency).toBe(FindingPublishingFrequency.ONE_HOUR);
    });

    test('SIX_HOURS export frequency', () => {
      const map = {
        exportFrequency: 'SIX_HOURS',
      };
      const result = setOptions(map);
      expect(result.exportFrequency).toBe(FindingPublishingFrequency.SIX_HOURS);
    });

    test('wrong export frequency', () => {
      const map = {
        exportFrequency: NaN,
      };
      expect(() => {
        setOptions(map);
      }).toThrowError();
    });

    test('undefined export frequency', () => {
      const map = {
        exportFrequency: undefined,
      };
      const result = setOptions(map);
      expect(result.exportFrequency).toBeUndefined();
    });

    test('all options enabled', () => {
      const map = {
        enableS3Protection: 'true',
        enableEksProtection: 'true',
        enableEksAgent: 'true',
        enableEc2Protection: 'true',
        enableKeepMalwareSnapshots: 'true',
        enableRdsProtection: 'true',
        enableLambdaProtection: 'true',
        exportFrequency: 'FIFTEEN_MINUTES',
      };
      const result = setOptions(map);
      expect(result.enableS3Protection).toBeTruthy();
      expect(result.enableEksProtection).toBeTruthy();
      expect(result.enableEksAgent).toBeTruthy();
      expect(result.enableEc2Protection).toBeTruthy();
      expect(result.enableKeepMalwareSnapshots).toBeTruthy();
      expect(result.enableRdsProtection).toBeTruthy();
      expect(result.enableLambdaProtection).toBeTruthy();
    });

    test('all options disabled', () => {
      const map = {
        enableS3Protection: 'false',
        enableEksProtection: 'false',
        enableEksAgent: 'false',
        enableEc2Protection: 'false',
        enableKeepMalwareSnapshots: 'false',
        enableRdsProtection: 'false',
        enableLambdaProtection: 'false',
        exportFrequency: 'FIFTEEN_MINUTES',
      };
      const result = setOptions(map);
      expect(result.enableS3Protection).toBeFalsy();
      expect(result.enableEksProtection).toBeFalsy();
      expect(result.enableEksAgent).toBeFalsy();
      expect(result.enableEc2Protection).toBeFalsy();
      expect(result.enableKeepMalwareSnapshots).toBeFalsy();
      expect(result.enableRdsProtection).toBeFalsy();
      expect(result.enableLambdaProtection).toBeFalsy();
    });
  });

  describe('removeDetectorFeatures', () => {
    test('calls commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementation(() => Promise.resolve(true));
      await removeDetectorFeatures(guardDutyClient, detectorId, existingMemberAccountIds, updateOptions);
      expect(guardDutyClient.send).toHaveBeenCalledTimes(2);
    });

    test('update fails commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementationOnce(() => {
        throw new Error();
      });
      await removeDetectorFeatures(guardDutyClient, detectorId, existingMemberAccountIds, updateOptions);
      expect(guardDutyClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMainDetector', () => {
    test('calls commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementation(() => Promise.resolve(true));
      await updateMainDetector(guardDutyClient, detectorId, updateOptions);
      const updateDetectorCommand = (guardDutyClient.send as jest.Mock).mock.calls[0][0];
      expect(updateDetectorCommand instanceof UpdateDetectorCommand).toBeTruthy();
      const updateMalwareCommand = (guardDutyClient.send as jest.Mock).mock.calls[1][0];
      expect(updateMalwareCommand instanceof UpdateMalwareScanSettingsCommand).toBeTruthy();
    });

    test('update fails commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementationOnce(() => {
        throw new Error();
      });

      await expect(async () => await updateMainDetector(guardDutyClient, detectorId, updateOptions)).rejects.toThrow();
      const updateDetectorCommand = (guardDutyClient.send as jest.Mock).mock.calls[0][0];
      expect(updateDetectorCommand).not.toBeUndefined();
      expect(updateDetectorCommand instanceof UpdateDetectorCommand).toBeTruthy();
      expect(guardDutyClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMemberDetectors', () => {
    test('calls commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementation(() => Promise.resolve(true));
      await updateMemberDetectors(guardDutyClient, detectorId, existingMemberAccountIds, updateOptions);
      const updateDetectorCommand = (guardDutyClient.send as jest.Mock).mock.calls[0][0];
      expect(updateDetectorCommand instanceof UpdateMemberDetectorsCommand).toBeTruthy();
      const updateMemberCommand = (guardDutyClient.send as jest.Mock).mock.calls[1][0];
      expect(updateMemberCommand instanceof UpdateMalwareScanSettingsCommand).toBeTruthy();
    });

    test('update fails commands', async () => {
      jest.spyOn(guardDutyClient, 'send').mockImplementationOnce(() => {
        throw new Error();
      });
      await expect(
        async () =>
          await await updateMemberDetectors(guardDutyClient, detectorId, existingMemberAccountIds, updateOptions),
      ).rejects.toThrow();
      const updateDetectorCommand = (guardDutyClient.send as jest.Mock).mock.calls[0][0];
      expect(updateDetectorCommand).not.toBeUndefined();
      expect(updateDetectorCommand instanceof UpdateMemberDetectorsCommand).toBeTruthy();
      expect(guardDutyClient.send).toHaveBeenCalledTimes(1);
    });
  });
});
