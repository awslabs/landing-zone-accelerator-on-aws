import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { Construct } from 'constructs';

export interface TrailProps extends cloudtrail.TrailProps {
  readonly isOrganizationTrail: boolean;
}

export class Trail extends cloudtrail.Trail {
  constructor(scope: Construct, id: string, props: TrailProps) {
    super(scope, id, props);

    const cfnRepository = this.node.defaultChild as cloudtrail.CfnTrail;
    cfnRepository.isOrganizationTrail = props.isOrganizationTrail;
  }
}
