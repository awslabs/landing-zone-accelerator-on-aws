# Module Naming and Scope

## Module Definition
In LZA, a module represents a dedicated codebase that manages a specific AWS service. Each module is responsible for handling configurations and operations for its designated AWS service only. For example:

- `macie` module exclusively manages Amazon Macie configurations and operations
- `control-tower` module handles AWS Control Tower management
- `guardduty` module manages Amazon GuardDuty configurations

## Module Scope Guidelines
1. **Single Service Responsibility**
      - One module corresponds to one AWS service
      - Each module encapsulates various operations related to its specific service
      - No cross-service operations within a single module

2. **Naming Convention**
      - Module names should match their corresponding AWS service name
      - Use lowercase, hyphen-separated names (e.g., `control-tower`, `security-hub`)
      - Names should be immediately identifiable with their AWS service

3. **Service Boundaries**
      - Module should contain service-specific operations
      - Configuration management for the service
      - Service-specific API interactions
      - Service-specific resource management

Example module structure:
```plaintext
source/packages/@aws-lza/lib/
├── macie/                  # Amazon Macie operations
├── control-tower/          # AWS Control Tower operations
├── security-hub/           # AWS Security Hub operations
└── guard-duty/             # Amazon GuardDuty operations
```

## Module Interface and Implementation Contract


Each module must have its interface definition in `interfaces/<module-name>.ts`

Each interface must extends `IModuleCommonParameter` interface

Interfaces define the contract that the module must implement

Example for Setup Control Tower Landing Zone interface:
```typescript
// interfaces/control-tower/setup-landing-zone.ts
export interface ISetupLandingZoneModule {
  handler(props: ISetupLandingZoneHandlerParameter): Promise<string>;
  // Other required methods and types
}
```

Implementation must be in the module's index.ts:
```typescript
// lib/control-tower/setup-landing-zone/index.ts
export class SetupLandingZoneModule
  implements ISetupLandingZoneModule {
  
  public async handler(
    props: ISetupLandingZoneHandlerParameter
  ): Promise<string> {
    // Implementation logic
  }
}
```


---

[← Back to Module Development Guide](./index.md)

[Module Development Guidelines →](./module-development-guidelines.md)