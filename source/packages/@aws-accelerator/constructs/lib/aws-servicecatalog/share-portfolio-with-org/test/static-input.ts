export abstract class StaticInput {
  public static readonly newPropsOrgShare = {
    portfolioId: 'portfolioId',
    organizationId: 'organizationId',
    tagShareOptions: 'true',
  };
  public static readonly orgIdOrgError = {
    portfolioId: 'portfolioId',
    organizationId: 'organizationId',
    organizationalUnitId: 'organizationalUnitId',
    tagShareOptions: 'true',
  };
  public static readonly noOrgIdOrgError = {
    portfolioId: 'portfolioId',
    tagShareOptions: 'true',
  };
  public static readonly newPropsOuShare = {
    portfolioId: 'portfolioId',
    organizationalUnitId: 'organizationalUnitId',
    tagShareOptions: 'true',
  };
}
