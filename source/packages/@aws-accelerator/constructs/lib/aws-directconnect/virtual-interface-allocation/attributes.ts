import { DirectConnect } from 'aws-sdk';

interface VirtualInterfaceAllocationAttributeProps {
  /**
   * The IP address family
   */
  readonly addressFamily: string;
  /**
   * The BGP ASN of the customer router
   */
  readonly asn: number;
  /**
   * The Direct Connect connection ID
   */
  readonly connectionId: string;
  /**
   * Whether to enable jumbo frames for the virtual interface
   */
  readonly jumboFrames: boolean;
  /**
   * The owner account of the virtual interface
   */
  readonly ownerAccount: string;
  /**
   * Enable SiteLink for the virtual interface
   */
  readonly siteLink: boolean;
  /**
   * The name of the virtual interface
   */
  readonly virtualInterfaceName: string;
  /**
   * The type of the virtual interface
   */
  readonly virtualInterfaceType: 'private' | 'transit';
  /**
   * The virtual local area network (VLAN) tag
   */
  readonly vlan: number;
  /**
   * The Amazon side peer IP address
   */
  readonly amazonAddress?: string;
  /**
   * The customer side peer IP address
   */
  readonly customerAddress?: string;
  /**
   * Tags for the virtual interface
   */
  readonly tags?: DirectConnect.TagList;
}

export class VirtualInterfaceAllocationAttributes {
  public readonly addressFamily: string;
  public readonly asn: number;
  public readonly connectionId: string;
  public readonly mtu: number;
  public readonly ownerAccount: string;
  public readonly siteLink: boolean;
  public readonly virtualInterfaceName: string;
  public readonly virtualInterfaceType: 'private' | 'transit';
  public readonly vlan: number;
  public readonly amazonAddress?: string;
  public readonly customerAddress?: string;
  public readonly tags?: DirectConnect.TagList;
  constructor(props: VirtualInterfaceAllocationAttributeProps) {
    this.addressFamily = props.addressFamily;
    this.amazonAddress = props.amazonAddress;
    this.asn = props.asn;
    this.connectionId = props.connectionId;
    this.customerAddress = props.customerAddress;
    this.ownerAccount = props.ownerAccount;
    this.siteLink = props.siteLink;
    this.tags = props.tags;
    this.virtualInterfaceName = props.virtualInterfaceName;
    this.virtualInterfaceType = props.virtualInterfaceType;
    this.vlan = props.vlan;

    // Set MTU
    let mtu = 1500;
    if (props.jumboFrames) {
      if (this.virtualInterfaceType === 'private') {
        mtu = 9001;
      }
      if (this.virtualInterfaceType === 'transit') {
        mtu = 8500;
      }
    }
    this.mtu = mtu;
  }
}
