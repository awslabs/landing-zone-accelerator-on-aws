export abstract class StaticInput {
  public static readonly newProps = {
    displayName: 'displayName',
    providerName: 'providerName',
  };
  public static readonly noPortfolioFoundError = `No portfolio ID was found for ${this.newProps.displayName} ${this.newProps.providerName} in the account`;
  public static readonly multiplePortfolioFoundError = `Multiple portfolio IDs were found for ${this.newProps.displayName} ${this.newProps.providerName} in the account`;
}
