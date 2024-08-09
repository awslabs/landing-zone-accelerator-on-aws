export abstract class StaticInput {
  public static readonly input = {
    props: {
      managementAccountId: '111111111111',
      accountIds: ['111111111111', '222222222222', '333333333333', '444444444444', '555555555555'],
      homeRegion: 'us-east-1',
      enabledRegions: ['ca-west-1'],
      globalRegion: 'us-east-1',
    },
  };
}
