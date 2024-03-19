/**
 * AWS Control Tower Landing Zone latest version.
 *
 * @remarks
 * Once Control Tower API support available for landing zone version, this hard coded constant will be removed.
 * When Control Tower Landing Zone gets new version, we need to update this constant.
 */
export const CONTROL_TOWER_LANDING_ZONE_VERSION = '3.3';

/**
 * Function to get baseline version based on AWS Control Tower Landing Zone version
 *
 * @remarks
 * Baseline version compatibility information can be found [here](https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html)
 * @param landingZoneVersion string
 * @returns baselineVersion string
 */
export function getBaselineVersion(landingZoneVersion: string): string {
  // base line version compatibility metrics can be found here https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html
  const landingZoneVersionSet1 = ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'];
  const landingZoneVersionSet2 = ['2.8', '2.9'];
  const landingZoneVersionSet3 = ['3.0', '3.1'];

  const baselineVersion = '4.0';

  if (landingZoneVersionSet1.includes(landingZoneVersion)) {
    return '1.0';
  }
  if (landingZoneVersionSet2.includes(landingZoneVersion)) {
    return '2.0';
  }
  if (landingZoneVersionSet3.includes(landingZoneVersion)) {
    return '3.0';
  }

  return baselineVersion;
}
