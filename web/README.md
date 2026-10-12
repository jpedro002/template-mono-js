# web

Template de front-end: React 19 + Vite + Tailwind v4 + shadcn/ui + Biome, com autenticação por cookie httpOnly, RBAC (usuários, perfis, permissões), roteamento por convenção de pastas e gerador de CRUD (plop).

## Começando

```bash
cp .env.example .env   # ajuste VITE_API_URL
bun install
bun dev
```

A API correspondente fica em `../api`. Convenções, arquitetura e comandos estão em `CLAUDE.md`; o guia visual em `DESIGN_SYSTEM.md`.

## Telas incluídas

- Login, esqueci/redefinir senha, confirmação de e-mail
- Perfil (dados pessoais e segurança)
- Segurança: usuários, perfis (roles) e permissões
- `/teste/cards`: CRUD de exemplo (referência para novas telas)
- `/design-system`: vitrine de componentes (superadmin)

## Novo CRUD

```bash
bun generate:crud
```
