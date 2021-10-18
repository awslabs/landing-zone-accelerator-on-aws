import * as cloudtrail from '@aws-cdk/aws-cloudtrail';
import * as cdk from '@aws-cdk/core';

export interface TrailProps extends cloudtrail.TrailProps {
  readonly isOrganizationTrail: boolean;
}

export class Trail extends cloudtrail.Trail {
  constructor(scope: cdk.Construct, id: string, props: TrailProps) {
    super(scope, id, props);

    const cfnRepository = this.node.defaultChild as cloudtrail.CfnTrail;
    cfnRepository.isOrganizationTrail = props.isOrganizationTrail;
  }
}
