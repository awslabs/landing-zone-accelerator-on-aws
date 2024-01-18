# Documentation Guidelines

This section outlines the recommended documentation style guidelines to use when developing features for the Landing Zone Accelerator on AWS.

## TypeDocs

This solution uses the [TSDoc](https://tsdoc.org/) standard to annotate configuration classes with helpful metadata. TSDoc uses TypeScript's multi-line comment style in order to find and generate documentation for classes and methods. When developing new features for the LZA, please keep the following in mind.

### Helpful Tips

* If you are developing new configuration APIs in the `@aws-accelerator/config` module, it is highly recommended to annotate your class and its properties with descriptive metadata. This added context helps users gain an understanding of how to customize the configuration for their unique organizational needs. Keep reading to following sections for style guidelines and examples to follow when developing class annotations.
* [TSDoc playground](https://tsdoc.org/play/) is a useful tool for testing your documentation code and TSDoc's built-in tags. 
* You may run `yarn docs` from the source directory in your local development environment to generate docs with changes you've made. The default output folder is `./source/docs`.

### Recommended Structure and Examples

The following style should be used for documenting classes, methods, and class properties.

* There should be a single space before and after the asterisk on each line of the multi-line comment.
* There should be a break between the description and any parameters/return values (i.e. a line with just an asterisk).
* Content Ordering:
    * Breadcrumb trail `@link` -- this should follow the full configuration object path so it is easier to navigate between nested configurations.
    * Description of class/property:
        * Is the class/property optional? Include `(OPTIONAL)` in the description.
        * Include links to public AWS documentation when relevant to do so. For example, link to the [What is Amazon VPC?](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html) documentation for the [VPCConfig](../typedocs/latest/classes/_aws_accelerator_config.VpcConfig.html) class.
        * Provide a high-level overview of the service/feature. Put yourself in the shoes of someone that doesn't have a fundamental understanding of what the service does. Use the service FAQ or "Getting Started" documentation as a guide for this description.
        * Do not use acronyms before first introducing the full service/feature name.
    * `@example` to be provided showing the proper use or multiple example uses in YAML format.
    * Use `@remarks` when adding notes/comments about the class or property value. Some things to keep top of mind when writing notes:
        * What happens if a user changes this property after initial deployment?
        * Are there any constraints for this property value (i.e. min/max numbers, unsupported characters, etc).
        * Put yourself in the shoes of a new LZA customer. Is there anything you would want to know as someone unfamiliar with the solution? For example, I need to reference the `name` property of a different config item. Where do a find that config?
        * Warn users of destructive actions appropriately in the notes. The following boilerplate serves as an example:
            * **CAUTION**: changing this value after initial deployment will cause `<resource type>` to be recreated. Please be aware that any downstream dependencies may cause this property update to fail.

The following example contains all of the necessary content as an example for the top-level class description for [IpamPoolConfig](../typedocs/latest/classes/_aws_accelerator_config.IpamPoolConfig.html) within [NetworkConfig](../typedocs/latest/classes/_aws_accelerator_config.NetworkConfig.html):

```ts
/**
 * *{@link NetworkConfig} / {@link CentralNetworkServicesConfig} / {@link IpamConfig} / {@link IpamPoolConfig}*
 *
 * {@link https://docs.aws.amazon.com/vpc/latest/ipam/how-it-works-ipam.html | VPC IPAM pool} configuration.
 * Use this configuration to define custom IPAM pools for your VPCs. A pool is a collection of contiguous
 * IP address ranges. IPAM pools enable you to organize your IP addresses according to your routing and security needs.
 *
 * @example
 * Base pool:
 * ```
 * - name: accelerator-base-pool
 *   description: Base IPAM pool
 *   provisionedCidrs:
 *     - 10.0.0.0/16
 *   tags: []
 * ```
 * Regional pool:
 * ```
 * - name: accelerator-regional-pool
 *   description: Regional pool for us-east-1
 *   locale: us-east-1
 *   provisionedCidrs:
 *     - 10.0.0.0/24
 *   sourceIpamPool: accelerator-base-pool
 * ```
 */
```

The following example shows the property definitions under the IpamPoolConfig class:

```ts
export class IpamPoolConfig implements t.TypeOf<typeof NetworkConfigTypes.ipamPoolConfig> {
  /**
   * The address family for the IPAM pool.
   *
   * @remarks
   * The default value is `ipv4`.
   *
   * @see {@link NetworkConfigTypes.ipVersionEnum}
   */
  readonly addressFamily: t.TypeOf<typeof NetworkConfigTypes.ipVersionEnum> | undefined = 'ipv4';
  /**
   * A friendly name for the IPAM pool.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the pool to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   */
  readonly name: string = '';
  /**
   * (OPTIONAL) The friendly name of the IPAM scope to assign the IPAM pool to.
   *
   * @remarks
   * Note: This is the logical `name` property of the scope as defined in network-config.yaml.
   * Leave this property undefined to create the pool in the default private scope.
   *
   * @see {@link IpamScopeConfig}
   */
  readonly scope: string | undefined = undefined;
  /**
   * (OPTIONAL) The default netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a default netmask length for all IPAM allocations in this pool.
   */
  readonly allocationDefaultNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) The maximum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a maximum netmask length for all IPAM allocations in this pool.
   * This value must be larger than the `allocationMinNetmaskLength` value.
   */
  readonly allocationMaxNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) The minimum netmask length of IPAM allocations for this pool.
   *
   * @remarks
   * Setting this property will enforce a minimum netmask length for all IPAM allocations in this pool.
   * This value must be less than the `allocationMaxNetmaskLength` value.
   */
  readonly allocationMinNetmaskLength: number | undefined = undefined;
  /**
   * (OPTIONAL) An array of tags that are required for resources that use CIDRs from this IPAM pool.
   *
   * @remarks
   * Resources that do not have these tags will not be allowed to allocate space from the pool.
   */
  readonly allocationResourceTags: t.Tag[] | undefined = undefined;
  /**
   * (OPTIONAL) If set to `true`, IPAM will continuously look for resources within the CIDR range of this pool
   * and automatically import them as allocations into your IPAM.
   */
  readonly autoImport: boolean | undefined = undefined;
  /**
   * (OPTIONAL) A description for the IPAM pool.
   */
  readonly description: string | undefined = undefined;
  /**
   * (OPTIONAL) The AWS Region where you want to make an IPAM pool available for allocations.
   *
   * @remarks
   * **CAUTION**: Changing this value after initial deployment
   * will cause the pool to be recreated.
   * Please be aware that any downstream dependencies may cause
   * this property update to fail.
   *
   * Only resources in the same Region as the locale of the pool can get IP address allocations from the pool.
   * A base (top-level) pool does not require a locale.
   * A regional pool requires a locale.
   */
  readonly locale: t.Region | undefined = undefined;
  /**
   * An array of CIDR ranges to provision for the IPAM pool.
   *
   * @remarks
   * **CAUTION**: Changing or removing an existing provisioned CIDR range after initial deployment may impact downstream VPC allocations.
   * Appending additional provisioned CIDR ranges does not impact downstream resources.
   *
   * Use CIDR notation, i.e. 10.0.0.0/16.
   * If defining a regional pool, the provisioned CIDRs must be a subset of the source IPAM pool's CIDR ranges.
   */
  readonly provisionedCidrs: string[] | undefined = undefined;
  /**
   * (OPTIONAL) Determines if a pool is publicly advertisable.
   *
   * @remarks
   * This option is not available for pools with AddressFamily set to ipv4.
   */
  readonly publiclyAdvertisable: boolean | undefined = undefined;
  /**
   * (OPTIONAL) Resource Access Manager (RAM) share targets.
   *
   * @remarks
   * Targets can be account names and/or organizational units.
   * Pools must be shared to any accounts/OUs that require IPAM allocations.
   * The pool does not need to be shared with the delegated administrator account.
   *
   * @see {@link ShareTargets}
   */
  readonly shareTargets: t.ShareTargets = new t.ShareTargets();
  /**
   * (OPTIONAL) The friendly name of the source IPAM pool to create this IPAM pool from.
   *
   * @remarks
   * Only define this value when creating regional IPAM pools. Leave undefined for top-level pools.
   */
  readonly sourceIpamPool: string | undefined = undefined;
  /**
   * (OPTIONAL) An array of tag objects for the IPAM pool.
   */
  readonly tags: t.Tag[] | undefined = undefined;
}
```

## GitHub Pages

LZA uses the [MkDocs](https://www.mkdocs.org/) static site generator to build this GitHub Pages website. MkDocs takes markdown files and a YAML manifest in order to generate the necessary HTML for GitHub Pages.

### Helpful Tips

* The YAML manifest and raw markdown files are located in the `./source/mkdocs` directory of the solution source code repository.
* It is recommended to read through [Getting Started with MkDocs](https://www.mkdocs.org/getting-started/) to understand how to install and interact with the mkdocs CLI and YAML manifest.
* If you install the development dependencies on your workstation, you can run `mkdocs serve` to easily test your changes on a local web server.

### Development Dependencies

The following additional development dependencies are required for testing documentation updates locally:

* [Python](https://www.python.org/) >= 3.11
* [mkdocs](https://pypi.org/project/mkdocs/) >= 1.5.3
* [mkdocs-material](https://pypi.org/project/mkdocs-material/) >= 9.5.3

!!! info
    The package versions the solution is using to build the site are pinned in `./.github/workflows/docs.yml`. It is recommended to use the same versions to ensure consistency between your local site and GitHub Pages. 

### Style Recommendations

* If creating a new top-level section for the website navbar, include an `index.md` page with a high-level description, subpages included in the section, and any other public reference material that may be relevant. For an example, see the [User Guide](../user-guide/index.md). 
* If creating a new subpage for a top-level section, make sure to update the MkDocs YAML manifest with the new page and add it to the list of subpages in that section's `index.md`.
* MkDocs uses standard markdown formatting. The [Markdown Cheat Sheet](https://www.markdownguide.org/cheat-sheet/) is a good reference for formatting your markdown files.
* There are some non-native markdown extensions enabled by the Material theme, namely [Admonitions](https://squidfunk.github.io/mkdocs-material/reference/admonitions/) and [Footnotes](https://squidfunk.github.io/mkdocs-material/reference/footnotes/). These features can be very useful for adding additional context and important notes to your documentation. See the [Material for MkDocs Reference](https://squidfunk.github.io/mkdocs-material/reference/) for all supported extensions. 

!!! info
    Not all markdown extensions are configured at this time, so you may need to add them to the configuration as they are needed.