# AWS Direct Connect FAQ

## Can I create a Direct Connect dedicated or hosted connection?

No. Direct Connect dedicated connections must first be requested through the AWS console, approved by AWS, and then ordered through an APN partner or network provider. Hosted connections must be ordered through an APN partner and then accepted in the AWS console. After this prerequisite has been completed, Landing Zone Accelerator can take in the physical connection ID (dxcon-xxxxxx) as a configuration property to create and manage private and transit virtual interfaces.

More information: [https://docs.aws.amazon.com/directconnect/latest/UserGuide/resiliency_toolkit.html](https://docs.aws.amazon.com/directconnect/latest/UserGuide/resiliency_toolkit.html)

## Can I create a Direct Connect Gateway?

Yes. A Direct Connect Gateway must be configured in order to configure other features such as virtual interfaces and associations with transit gateways. The gateway as well as other features can be configured in the `network-config.yaml` accelerator configuration file. It is recommended that the Direct Connect Gateway is configured in the same account that the transit gateway(s) reside in. This enables the accelerator to manage the full lifecycle of transit gateway associations to the Direct Connect Gateway, as well as manage transit gateway static routes, route table associations, and route table propagations that reference the Direct Connect Gateway.

!!!note "See also"
    [Direct Connect Gateway configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.DxGatewayConfig.html)

## How do I create a Direct Connect virtual interface?

You must first complete the [prerequisites](https://docs.aws.amazon.com/directconnect/latest/UserGuide/resiliency_toolkit.html#prerequisites) to set up a physical Direct Connect connection. A Direct Connect Gateway must also be created and managed by the accelerator to create virtual interfaces. Once the physical connection is no longer in a pending state, you can reference the physical connection ID (dxcon-xxxxxx) in the `network-config.yaml` accelerator configuration file to begin creating virtual interfaces.

**Note:** The accelerator can manage the full lifecycle of a virtual interface if the Direct Connect Gateway and physical connection reside in the same account. Due to billing requirements for Direct Connect owners, this is not always possible. For these use cases, the accelerator can also allocate hosted virtual interfaces, but there is a manual billing acceptance step that must be completed by a human after the initial creation.

!!!note "See also"
    [Direct Connect virtual interface configuration reference](../../typedocs/latest/classes/_aws_accelerator_config.DxVirtualInterfaceConfig.html)

## Can I create a hosted virtual interface?

Yes. If the `ownerAccount` property of the virtual interface configuration specifies a different account than the `account` property of the Direct Connect Gateway, the accelerator CDK application will create a hosted virtual interface allocation from the account that owns the physical connection to the Direct Connect Gateway owner account. Virtual interface allocations must be manually accepted after creation and attached to a Direct Connect Gateway in order to be used. The accelerator will not manage this acceptance process as it is billing-related and should be explicitly reviewed by a human or automation outside of the accelerator.

**Notes:**

- The physical connection must be owned by an account managed by the accelerator.
- After the initial creation of the hosted virtual interface, the `interfaceName` and `tags` properties can no longer be managed by the accelerator. However, `jumboFrames` and `enableSiteLink` may still be updated.

## How do I associate a Direct Connect Gateway with a Transit Gateway?

It is required that both the Direct Connect Gateway and Transit Gateway are managed by the accelerator. An association to a transit gateway can be configured in the `network-config.yaml` accelerator configuration file. It is recommended that both gateways reside in the same account, however due to billing requirements for some organizations, this is not always possible. For these use cases, the accelerator can also create an **association proposal** from a Transit Gateway owner account to a Direct Connect Gateway owner account. This is determined dynamically by the CDK application based on the `account` property of each resource.

**Notes:**

- There are limitations with association proposals. After the initial proposal is created, a manual acceptance process must be completed. The accelerator will not manage this acceptance process as it is billing-related and should be explicitly reviewed by a human. Updates to the proposal (i.e. allowed route prefixes) can be made via the accelerator, but must be reviewed and approved by a human or automation outside of the accelerator.
- Gateway associations configured in the same account can additionally manage transit gateway static routes, route table associations, and route table propagations via the accelerator. Association proposals cannot manage these additional features.
- The association process between a Direct Connect Gateway and Transit Gateway can take anywhere from five to twenty minutes on average. The length of time depends on current load of the Direct Connect control plane in the region the association is occurring. Your pipeline progression will be paused until it validates the association has completed.

!!!note "See also"
    [Direct Connect Gateway Transit Gateway association reference](../../typedocs/latest/classes/_aws_accelerator_config.DxTransitGatewayAssociationConfig.html)

## Why is my NetworkAssociations stack in UPDATE_ROLLBACK_COMPLETE status after adding a Transit Gateway Association?

The association process between a Direct Connect Gateway and Transit Gateway can take anywhere from five to twenty minutes on average. The length of time depends on current load of the Direct Connect control plane in the region the association is occurring. Prior to v1.3.0, the accelerator was utilizing an AWS Lambda-backed custom resource to process this association and validate its completion. If the association took longer than 15 minutes, the Lambda would time out and cause this error. If running a version prior to v1.3.0, you can safely retry the Deploy stage of the pipeline after the association has completed to get past this error, and it will not occur on subsequent runs.

As of v1.3.0, this issue has been rectified and the custom resource should no longer fail after 15 minutes. Note that the association process will pause pipeline progression until it has completed.