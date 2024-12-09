# Project Structure
The LZA modules are organized within the `aws-lza` project located in `source/packages/@aws-lza` with the following structure:

```plaintext
source/packages/@aws-lza/
├── lib/                            # Core module implementations
│   ├── control-tower/              # Control Tower specific operations
│   ├── macie/                      # Macie specific operations
│   └── other-modules/              # Other module implementations
├── common/                         # Shared resources across modules
├── executors/                      # Entry point functions for modules
├── interfaces/                     # Module interface definitions
├── test/                           # Test implementations
│   ├── control-tower/              # Control Tower tests
│   ├── macie/                      # Macie tests
│   └── utils/                      # Common test utilities
└── index.ts                        # Package exports
```

---

[← Back to Module Development Guide](./index.md)

[Module Naming and Scope →](./module-naming-and-scope.md)