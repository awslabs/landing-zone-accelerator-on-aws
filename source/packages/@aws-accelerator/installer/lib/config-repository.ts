import * as cdk from '@aws-cdk/core';
import { Asset } from '@aws-cdk/aws-s3-assets';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import * as path from "path";
import * as os from "os";
import * as fs from "fs";


const SAMPLE_CONFIG_FILE_NAME = "config.example.json";
const SAMPLE_CONFIG_FILE_NAME1 = "config.example_1.json";

const SAMPLE_CONFIG_TEMPLATE = {
    "old_replacements": {
        "addl_regions": {
            "a": ["${HOME_REGION}"],
            "b": ["${HOME_REGION}", "${GBL_REGION}"],
            "c": ["${HOME_REGION}", "${GBL_REGION}", "us-east-2", "us-west-1", "us-west-2"]
        },
        "INFO": "Deploying in us-east-1 requires removing ${GBL_REGION} from the above variables",
        "INFO1": "If deploying the firewalls, both cidr values below MUST be supplied",
        "cloud-cidr1": "10.0.0.0",
        "cloud-mask1": "255.0.0.0",
        "cloud-cidr2": "100.96.252.0",
        "cloud-mask2": "255.255.254.0",
        "range-restrict": ["10.0.0.0/8", "100.96.252.0/23", "100.96.250.0/23"],
        "range-mad": "100.96.252.0/23",
        "range-dev-test": ["0.0.0.0/0"],
        "alarm-not-ip": "10.10.10.*"
    }
};

const SAMPLE_CONFIG_TEMPLATE1 = {
    "new_replacements": {
        "addl_regions": {
            "a": ["${HOME_REGION}"],
            "b": ["${HOME_REGION}", "${GBL_REGION}"],
            "c": ["${HOME_REGION}", "${GBL_REGION}", "us-east-2", "us-west-1", "us-west-2"]
        },
        "INFO": "123 Deploying in us-east-1 requires removing ${GBL_REGION} from the above variables",
        "INFO1": "If deploying the firewalls, both cidr values below MUST be supplied",
        "cloud-cidr1": "10.0.0.0",
        "cloud-mask1": "255.0.0.0",
        "cloud-cidr2": "100.96.252.0",
        "cloud-mask2": "255.255.254.0",
        "range-restrict": ["10.0.0.0/8", "100.96.252.0/23", "100.96.250.0/23"],
        "range-mad": "100.96.252.0/23",
        "range-dev-test": ["0.0.0.0/0"],
        "alarm-not-ip": "10.10.10.*"
    }
};

interface ConfigRepositoryProps {
    readonly repositoryName: string;
    readonly repositoryBranchName?: string;
    readonly description?: string;
}

/**
 * Class to create AWS accelerator configuration repository and initialize the repository with default configuration
 */
export class ConfigRepository extends cdk.Construct {

    readonly configRepo: cdk_extensions.Repository;

    constructor(scope: cdk.Construct, id: string, props: ConfigRepositoryProps) {
        super(scope, id);

        const acceleratorConfigAssetTempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), "config-assets-"));

        fs.writeFileSync(path.join(acceleratorConfigAssetTempDirPath,SAMPLE_CONFIG_FILE_NAME), JSON.stringify(SAMPLE_CONFIG_TEMPLATE), 'utf8');
        fs.writeFileSync(path.join(acceleratorConfigAssetTempDirPath,SAMPLE_CONFIG_FILE_NAME1), JSON.stringify(SAMPLE_CONFIG_TEMPLATE1), 'utf8');

        const configurationDefaultsAssets = new Asset(this, 'ConfigurationDefaultsAssets', {
            path: acceleratorConfigAssetTempDirPath,
        });

        this.configRepo = new cdk_extensions.Repository (this, 'Resource', {
            repositoryName: props.repositoryName,
            repositoryBranchName: props.repositoryBranchName!,
            s3BucketName: configurationDefaultsAssets.bucket.bucketName,
            s3key: configurationDefaultsAssets.s3ObjectKey
        });
    }

    /**
     * Method to get initialized repository object
     *
     * @return Returns Initialized repository object.
     */
    public getRepository() : cdk_extensions.Repository {
        return this.configRepo;
    }
}