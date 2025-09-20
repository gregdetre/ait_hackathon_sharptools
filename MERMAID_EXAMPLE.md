## Mermaid Diagram Example

This file demonstrates a simple Mermaid flowchart.

```mermaid
flowchart TD
  A[User] -->|opens app| B(Homepage)
  B --> C{Authenticated?}
  C -- Yes --> D[Dashboard]
  C -- No --> E[Login]
  E --> D
```

Notes:
- GitHub and many docs tools render Mermaid diagrams automatically.
- You can preview and tweak this diagram in the Mermaid Live Editor (`https://mermaid.live`).
