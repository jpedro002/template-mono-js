# Design System & Guia de Engenharia de Interface

**Versão:** 4.0.0
**Status:** Aprovado / Produção
**Stack Web:** React 19 + Vite (rolldown) + **Tailwind CSS v4** (CSS-first) + shadcn/ui + Biome
**Stack Mobile:** React Native / Expo (tokens espelhados em `theme.ts`)
**Conformidade:** WCAG 2.1 AA (texto) / AA (componentes gráficos)

> **Mudança vs. v3.0:** a paleta de marca (ouro/taupe/laranja) foi substituída por uma **paleta azul** única. Os tokens `gold-*`, `taupe*` e `cta*` viraram `brand-*` e `neutral*`; o par `primary` agora é o próprio azul de marca (não há mais cor separada para "CTA"); os tokens de fase (`plan/do/check/act`) foram removidos. Continua valendo: **sem `tailwind.config.js`**, tokens em `oklch` dentro de `src/index.css` (`@theme inline`), consumidos pelos componentes shadcn via tokens semânticos (`--primary`, `--ring`, `--border`…).

---

## 1. Fundamentos & Princípios de Engenharia

Objetivo: interface densa e previsível, com identidade azul, contraste rigoroso, estados consistentes e paridade entre plataformas.

### Pilares arquiteturais

1. **Densidade & ergonomia visual.** Canvas azul-acinzentado muito claro (`bg`, ≈`#F6F9FC`) reduz fadiga ocular; contenção estrutural por bordas sutis (`border`), não por sombras pesadas.
2. **Uma cor de marca.** O azul `brand` é ação primária, foco e seleção. Sucesso (`success`, verde-petróleo) e erro (`destructive`) são os únicos outros matizes semânticos.
3. **Token único, dois consumidores.** Toda cor é declarada uma vez como variável CSS de marca (`--brand-*`); os tokens semânticos do shadcn **apontam** para ela. Nenhum componente lê a cor de marca direto de hex.
4. **Texto azul usa `brand-text`.** `brand` serve de fundo/borda/anel; texto e ícone azul sobre claro usam `brand-text` (≥4.5:1 inclusive sobre `brand-light`).
5. **oklch, não hex.** Espaço perceptualmente uniforme: derivar hover/active é ajuste de `L`, e opacidade por slash (`bg-brand/12`) não suja o matiz.

---

## 2. Tokens de Cor

### 2.1. Paleta de marca

| Token            | oklch                         | Hex (mobile) | Papel semântico                                              |
| :--------------- | :---------------------------- | :----------- | :----------------------------------------------------------- |
| `brand`          | `oklch(0.546 0.245 262.88)`   | `#155DFC`    | Ação primária (`--primary`), preenchimento, gráficos         |
| `brand-strong`   | `oklch(0.546 0.245 262.88)`   | `#155DFC`    | Borda ativa, anel de foco (`--ring`)                         |
| `brand-text`     | `oklch(0.488 0.243 264.38)`   | `#1447E6`    | Texto/ícone azul sobre claro, link                           |
| `brand-hover`    | `oklch(0.488 0.243 264.38)`   | `#1447E6`    | Hover de ação primária                                       |
| `brand-active`   | `oklch(0.424 0.199 265.64)`   | `#193CB8`    | Pressed de ação primária                                     |
| `brand-light`    | `oklch(0.97 0.014 254.6)`     | `#EFF6FF`    | Item selecionado, badge, tab/menu ativo (`--accent`)         |
| `neutral`        | `oklch(0.62 0.03 257)`        | `#7B8799`    | Borda intermediária, ícone de input, avatar                  |
| `neutral-light`  | `oklch(0.93 0.012 257)`       | `#E3E8F0`    | Trilha de progresso, chip desabilitado (`--muted`)           |
| `success`        | `oklch(0.4365 0.0473 191.59)` | `#305A58`    | Sucesso, validação, métrica positiva                         |
| `bg`             | `oklch(0.98 0.005 250)`       | `#F6F9FC`    | Canvas da aplicação (`--background`)                         |
| `surface`        | `oklch(1 0 0)`                | `#FFFFFF`    | Card, modal, drawer, input                                   |
| `border`         | `oklch(0.91 0.012 257)`       | `#DCE2E9`    | Divisor de tabela, borda de input                            |
| `text`           | `oklch(0.27 0.03 260)`        | `#1E2735`    | Texto principal, título, label                               |
| `muted`          | `oklch(0.5 0.025 257)`        | `#5A6472`    | Texto secundário, timestamp, hint                            |
| `destructive`    | `oklch(0.5771 0.2152 27.33)`  | `#DC2626`    | Erro de validação, ação destrutiva                           |

Gráficos (`chart-1..5`): escala azul — `brand`, azul claro (`#51A2FF`), `brand-active`, `neutral`, azul pastel (`#8EC5FF`). Sempre com legenda rotulada.

### 2.2. Matriz de contraste — **valores medidos** (WCAG 2.1, luminância relativa)

| Par                           | Medido    | Requisito       | Veredito | Nota                                          |
| :---------------------------- | :-------- | :-------------- | :------- | :-------------------------------------------- |
| `text` / `bg`                 | **14.24** | 4.5 (texto)     | AAA      | —                                             |
| `muted` / `bg`                | **5.66**  | 4.5 (texto)     | AA       | ok até 12px                                   |
| `brand` / `#FFF`              | **5.26**  | 4.5 (texto)     | AA       | texto branco sobre botão primário             |
| `brand` / `bg`                | **4.96**  | 3.0 (UI)        | AA       | borda/anel de foco                            |
| `brand-hover` / `#FFF`        | **6.82**  | 4.5             | AA       | hover do botão primário                       |
| `brand-active` / `#FFF`       | **8.84**  | 4.5             | AAA      | pressed                                       |
| `brand-text` / `brand-light`  | **6.26**  | 4.5 (texto)     | AA       | badge e item ativo legíveis                   |
| `brand` / `brand-light`       | **4.82**  | 4.5 (texto)     | AA       | —                                             |
| `neutral` / `bg`              | **3.43**  | 3.0 (UI)        | AA (UI)  | contorno/ícone — não usar como texto          |
| `success` / `#FFF`            | **7.69**  | 4.5             | AAA      | —                                             |
| `destructive` / `#FFF`        | **4.83**  | 4.5             | AA       | —                                             |
| `border` / `bg`               | **1.23**  | — (decorativo)  | n/a      | nunca é o único portador de informação        |
| `brand` (dark) / `bg` (dark)  | **6.87**  | 4.5             | AA       | tema escuro                                   |
| `brand-text` (dark) / `bg` (dark) | **10.0** | 4.5          | AAA      | tema escuro                                   |

**Regras derivadas, não negociáveis:**

- Texto azul → `brand-text`. Sempre.
- Borda/anel/foco azul → `brand-strong`.
- `neutral` nunca é cor de texto.
- Botão primário com fonte <14px ou peso <500 → usar `brand-hover` como fundo (6.82:1).

---

## 3. Implementação: `src/index.css`

Fonte de verdade única (o bloco abaixo espelha o arquivo). Camadas: (1) marca em `:root`/`.dark`, (2) remapeamento semântico shadcn, (3) exposição via `@theme inline`.

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
	/* radius base 8px → sm 4 / md 6 / lg 8 / xl 12 */
	--radius: 0.5rem;

	/* ---------- marca (azul) ---------- */
	--brand: oklch(0.546 0.245 262.88);
	--brand-strong: oklch(0.546 0.245 262.88);
	--brand-text: oklch(0.488 0.243 264.38);
	--brand-hover: oklch(0.488 0.243 264.38);
	--brand-active: oklch(0.424 0.199 265.64);
	--brand-light: oklch(0.97 0.014 254.6);
	--neutral: oklch(0.62 0.03 257);
	--neutral-light: oklch(0.93 0.012 257);
	--brand-success: oklch(0.4365 0.0473 191.59);

	/* ---------- semânticos shadcn ---------- */
	--background: oklch(0.98 0.005 250);
	--foreground: oklch(0.27 0.03 260);
	--card: oklch(1 0 0);
	--card-foreground: var(--foreground);
	--popover: oklch(1 0 0);
	--popover-foreground: var(--foreground);

	--primary: var(--brand);
	--primary-foreground: oklch(1 0 0);
	--secondary: oklch(1 0 0);
	--secondary-foreground: var(--foreground);
	--muted: var(--neutral-light);
	--muted-foreground: oklch(0.5 0.025 257);
	--accent: var(--brand-light);
	--accent-foreground: var(--brand-text);
	--destructive: oklch(0.5771 0.2152 27.33);
	--destructive-foreground: oklch(1 0 0);
	--success: var(--brand-success);
	--success-foreground: oklch(1 0 0);

	--border: oklch(0.91 0.012 257);
	--input: oklch(0.91 0.012 257);
	--ring: var(--brand-strong);

	--chart-1: oklch(0.546 0.245 262.88);
	--chart-2: oklch(0.707 0.165 254.62);
	--chart-3: oklch(0.424 0.199 265.64);
	--chart-4: oklch(0.62 0.03 257);
	--chart-5: oklch(0.809 0.105 251.81);

	--sidebar: oklch(1 0 0);
	--sidebar-foreground: var(--foreground);
	--sidebar-primary: var(--brand-text);
	--sidebar-primary-foreground: oklch(1 0 0);
	--sidebar-accent: var(--brand-light);
	--sidebar-accent-foreground: var(--brand-text);
	--sidebar-border: oklch(0.91 0.012 257);
	--sidebar-ring: var(--brand-strong);
}

.dark {
	--brand: oklch(0.707 0.165 254.62);
	--brand-strong: oklch(0.707 0.165 254.62);
	--brand-text: oklch(0.809 0.105 251.81);
	--brand-hover: oklch(0.809 0.105 251.81);
	--brand-active: oklch(0.623 0.214 259.81);
	--brand-light: oklch(0.28 0.06 262);
	--neutral: oklch(0.62 0.03 257);
	--neutral-light: oklch(0.32 0.025 260);
	--brand-success: oklch(0.68 0.075 191.59);

	--background: oklch(0.2 0.03 262);
	--foreground: oklch(0.97 0.005 250);
	--card: oklch(0.24 0.035 262);
	--card-foreground: var(--foreground);
	--popover: oklch(0.24 0.035 262);
	--popover-foreground: var(--foreground);

	--primary: var(--brand);
	--primary-foreground: oklch(0.18 0.03 262);
	--secondary: oklch(0.24 0.035 262);
	--secondary-foreground: var(--foreground);
	--muted: var(--neutral-light);
	--muted-foreground: oklch(0.72 0.02 257);
	--accent: var(--brand-light);
	--accent-foreground: var(--brand-text);
	--destructive: oklch(0.704 0.191 22.216);
	--destructive-foreground: oklch(0.18 0.01 27);
	--success: var(--brand-success);
	--success-foreground: oklch(0.18 0.01 190);

	--border: oklch(0.32 0.025 260);
	--input: oklch(1 0 0 / 15%);
	--ring: var(--brand-strong);

	--sidebar: oklch(0.24 0.035 262);
	--sidebar-foreground: var(--foreground);
	--sidebar-primary: var(--brand-text);
	--sidebar-primary-foreground: oklch(0.18 0.03 262);
	--sidebar-accent: var(--brand-light);
	--sidebar-accent-foreground: var(--brand-text);
	--sidebar-border: oklch(0.32 0.025 260);
	--sidebar-ring: var(--brand-strong);
}

@theme inline {
	--radius-sm: calc(var(--radius) - 4px);
	--radius-md: calc(var(--radius) - 2px);
	--radius-lg: var(--radius);
	--radius-xl: calc(var(--radius) + 4px);
	--radius-2xl: calc(var(--radius) + 8px);
	--radius-3xl: calc(var(--radius) + 12px);
	--radius-4xl: calc(var(--radius) + 16px);

	/* marca */
	--color-brand: var(--brand);
	--color-brand-strong: var(--brand-strong);
	--color-brand-text: var(--brand-text);
	--color-brand-hover: var(--brand-hover);
	--color-brand-active: var(--brand-active);
	--color-brand-light: var(--brand-light);
	--color-neutral: var(--neutral);
	--color-neutral-light: var(--neutral-light);

	/* semânticos */
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-popover: var(--popover);
	--color-popover-foreground: var(--popover-foreground);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-destructive-foreground: var(--destructive-foreground);
	--color-success: var(--success);
	--color-success-foreground: var(--success-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);
	--color-chart-1: var(--chart-1);
	--color-chart-2: var(--chart-2);
	--color-chart-3: var(--chart-3);
	--color-chart-4: var(--chart-4);
	--color-chart-5: var(--chart-5);
	--color-sidebar: var(--sidebar);
	--color-sidebar-foreground: var(--sidebar-foreground);
	--color-sidebar-primary: var(--sidebar-primary);
	--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
	--color-sidebar-accent: var(--sidebar-accent);
	--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
	--color-sidebar-border: var(--sidebar-border);
	--color-sidebar-ring: var(--sidebar-ring);

	/* tipografia */
	--text-display: 1.75rem;
	--text-display--line-height: 2.25rem;
	--text-display--letter-spacing: -0.02em;
	--text-display--font-weight: 800;
	--text-h1: 1.375rem;
	--text-h1--line-height: 1.75rem;
	--text-h1--letter-spacing: -0.01em;
	--text-h1--font-weight: 700;
	--text-h2: 1.125rem;
	--text-h2--line-height: 1.5rem;
	--text-h2--font-weight: 600;
	--text-kpi: 1.75rem;
	--text-kpi--line-height: 2rem;
	--text-kpi--letter-spacing: -0.02em;
	--text-kpi--font-weight: 700;
	--text-body: 0.875rem;
	--text-body--line-height: 1.25rem;
	--text-caption: 0.75rem;
	--text-caption--line-height: 1rem;
	--text-caption--font-weight: 500;
	--text-overline: 0.6875rem;
	--text-overline--line-height: 0.875rem;
	--text-overline--letter-spacing: 0.05em;
	--text-overline--font-weight: 700;

	/* elevação ótica */
	--shadow-xs: 0 1px 2px 0 oklch(0.27 0.03 260 / 0.04);
	--shadow-sm: 0 1px 3px 0 oklch(0.27 0.03 260 / 0.06),
		0 1px 2px -1px oklch(0.27 0.03 260 / 0.04);
	--shadow-md: 0 4px 6px -1px oklch(0.27 0.03 260 / 0.08),
		0 2px 4px -2px oklch(0.27 0.03 260 / 0.04);
	--shadow-lg: 0 10px 15px -3px oklch(0.27 0.03 260 / 0.08),
		0 4px 6px -4px oklch(0.27 0.03 260 / 0.04);

	/* alturas de controle */
	--spacing-control: 2.5rem;
	--spacing-control-touch: 3rem;
}

@layer base {
	* {
		@apply border-border outline-ring/50;
	}
	body {
		@apply bg-background text-foreground text-body antialiased;
	}
}
```

### 3.1. Notas de v4 que mudam o dia a dia

- **`@theme` vs `@theme inline`.** `inline` insere o valor final no utilitário — obrigatório quando o token aponta para outra var que muda por tema (`.dark`). Todo o bloco acima é `inline` por isso.
- **`--color-*` gera utilitário.** Declarar `--color-brand` cria `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `fill-brand`, `divide-brand` — sem config.
- **Opacidade por slash funciona em token custom:** `bg-brand/12`, `ring-brand-strong/20`.
- **`--spacing` é gerado, não enumerado.** v4 deriva `p-1 … p-96` de `--spacing: 0.25rem`. **Não redeclarar** a escala 1/2/3/4/5/6/8/12 — ela já existe. A tabela §4 é convenção de uso, não config.
- **Não existe `tailwind.config.js` neste projeto.** Plugin é `@tailwindcss/vite`. Qualquer PR que adicione config JS deve ser rejeitado.
- **Cores arbitrárias em hex (`text-[#1447E6]`) são proibidas em review** — quebram tema escuro.

---

## 4. Escala Estrutural

### 4.1. Espaçamento (grid 4px — nativo v4)

| Utilitário | Valor | Aplicação típica                                       |
| :--------- | :---- | :----------------------------------------------------- |
| `1`        | 4px   | Gap ícone↔texto compacto, padding de chip              |
| `2`        | 8px   | Gap interno de botão, padding vertical de input        |
| `3`        | 12px  | Padding horizontal de input/botão compacto             |
| `4`        | 16px  | Margem de formulário, gap de lista e grid              |
| `5`        | 20px  | Padding de card de dados                               |
| `6`        | 24px  | Padding de modal, painel lateral, card principal       |
| `8`        | 32px  | Espaço entre seções de dashboard                       |
| `12`       | 48px  | Margem superior de página, quebra estrutural           |

### 4.2. Raio (`--radius: 0.5rem`)

| Utilitário     | Valor  | Uso                                       |
| :------------- | :----- | :---------------------------------------- |
| `rounded-sm`   | 4px    | Badge compacto, tooltip, tag de tabela    |
| `rounded-md`   | 6px    | Input, select, chip clicável              |
| `rounded-lg`   | 8px    | Botões, dropdown menu                     |
| `rounded-xl`   | 12px   | Card analítico, painel, modal             |
| `rounded-full` | —      | Avatar, pílula de status, FAB             |

### 4.3. Elevação

Sem sombra difusa escura. Borda física + sombra ótica:

- **Nível 0 (flat):** `border border-border` — padrão de card e input.
- **Nível 1 (hover/popover):** `shadow-sm`
- **Nível 2 (dropdown/modal):** `shadow-lg`

---

## 5. Tipografia

Font stack padrão (definir em `--font-sans` se divergir do default v4):

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Helvetica, Arial, sans-serif
```

| Utilitário       | Desktop / Mobile   | Line-height | Peso | Tracking | Cor            |
| :--------------- | :----------------- | :---------- | :--- | :------- | :------------- |
| `text-display`   | 28px / 24px        | 36 / 32     | 800  | -0.02em  | `foreground`   |
| `text-h1`        | 22px / 20px        | 28 / 26     | 700  | -0.01em  | `foreground`   |
| `text-h2`        | 18px / 16px        | 24 / 22     | 600  | 0        | `foreground`   |
| `text-kpi`       | 28px / 24px        | 32 / 28     | 700  | -0.02em  | `foreground`   |
| `text-body`      | 14px               | 20          | 400  | 0        | `foreground`   |
| `text-body` + `font-medium` | 14px    | 20          | 500  | 0        | `foreground`   |
| `text-caption`   | 12px               | 16          | 500  | +0.01em  | `muted-foreground` |
| `text-overline`  | 11px / 10px        | 14          | 700  | +0.05em  | `muted-foreground`, `uppercase` |

Reduções mobile via responsive: `text-h1 max-sm:text-[1.25rem]/[1.625rem]`.

---

## 6. Componentes

Altura mínima de clique: **40px web** (`h-10`), **48px mobile** (`h-12`).

### 6.1. Botões — variantes CVA

Aplicar em `src/components/ui/button.jsx` (a única exceção autorizada à regra "não modificar `ui/`", pois é onde as variantes vivem):

```js
default: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-active shadow-xs',
secondary: 'bg-card text-foreground border border-border hover:bg-background hover:border-neutral',
brand: 'bg-brand-light text-brand-text border border-brand-strong/30 hover:bg-brand-light/70',
destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
link: 'text-brand-text underline-offset-4 hover:underline',
```

Foco em todas: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none`.

| Variante        | Fundo         | Hover        | Texto           | Uso                          |
| :-------------- | :------------ | :----------- | :-------------- | :--------------------------- |
| **Primária**    | `brand`       | `brand-hover` | `#FFF` 14px/600 | Ação crítica, disparo        |
| **Secundária**  | `card`        | `background` + borda `neutral` | `foreground` 14px/500 | Neutra, estrutural |
| **Suave (brand)**| `brand-light` | `brand-light/70` | `brand-text` 14px/600 | Contextual de marca    |

### 6.2. Inputs & Selects

```
h-10 md:h-10 max-md:h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-body
text-foreground placeholder:text-muted-foreground
focus-visible:border-brand-strong focus-visible:ring-2 focus-visible:ring-brand-strong/20 outline-none
aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20
disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed
```

Mensagem de erro: `text-caption text-destructive mt-1`, ligada por `aria-describedby`. O componente `Form` (`src/components/Form/FormWeb.jsx`) já propaga o estado de erro do Zod — as classes acima pertencem aos campos em `src/components/Form/FormFieldsWeb/`.

### 6.3. Badges

Variantes em `src/components/ui/badge.jsx`: `default` (primário), `secondary`, `outline`, `brand` (`border-brand-strong/25 bg-brand-light text-brand-text`), `success`, `destructive`.

Base comum: `inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption`. Status sempre cor **+** texto (ou ícone).

### 6.4. Tabelas (`GenericTable`)

Aplicar em `src/components/table/table.jsx`:

- **Header:** `bg-background text-overline text-muted-foreground border-b border-border`
- **Linha:** `min-h-12 px-4 border-b border-border`
- **Hover:** `hover:bg-brand/[0.04]`
- **Selecionada:** `bg-brand-light border-l-[3px] border-l-brand-strong`
- **Vazia:** célula única `text-body text-muted-foreground py-12 text-center`
- Coluna numérica: `text-right tabular-nums`

### 6.5. Sidebar

`sidebar-accent` = `brand-light` e `sidebar-primary` = `brand-text` já fazem o item ativo herdar o azul de marca pelos componentes shadcn existentes — sem classe extra em `app-sidebar.jsx`/`nav-main.jsx`.

---

## 7. Acessibilidade & UX

1. **Alvo de toque.** Nenhum interativo abaixo de **44×44px** no mobile ou **36×36px** no desktop. Ícone-botão pequeno: expandir área com `p-2 -m-2` em vez de aumentar o glifo.
2. **Teclado.** `:focus-visible` explícito com `ring-ring` (= `brand-strong`) e `ring-offset-2`. Nunca `outline-none` sem substituto.
3. **Nunca só cor.** Status em tabela/card = cor **+** texto, ou cor **+** ícone semântico. Vale também para gráficos: `chart-1..5` precisam de legenda rotulada, não legenda por bolinha.
4. **Movimento.** Respeitar `motion-reduce:transition-none` em transições do `tw-animate-css`.
5. **Zoom 200%.** Layouts densos usam `min-w-0` + `overflow-x-auto` no container de tabela, nunca `overflow-hidden`.
6. **Tema escuro.** Ativado por `.dark` no `<html>`. Azul clareado para `oklch(0.707 0.165 254.62)` (6.87:1 sobre o fundo escuro). Toda cor de tema escuro é override de `--brand-*`/`--*` em `.dark` — nenhum componente carrega `dark:` de cor de marca.

---

## 8. Espelho Mobile — `theme.ts` (React Native / Expo)

RN não lê `oklch` de forma confiável em todas as versões; mantém-se hex como valor de runtime, com o oklch da §2.1 como fonte de verdade de design.

```typescript
export const theme = {
	colors: {
		brand: {
			brand: '#155DFC',
			brandStrong: '#155DFC',
			brandText: '#1447E6',
			brandHover: '#1447E6',
			brandActive: '#193CB8',
			brandLight: '#EFF6FF',
			neutral: '#7B8799',
			neutralLight: '#E3E8F0',
			bg: '#F6F9FC',
			surface: '#FFFFFF',
			border: '#DCE2E9',
			text: '#1E2735',
			muted: '#5A6472',
			success: '#305A58',
			destructive: '#DC2626',
		},
		dark: {
			bg: '#0E1624',
			surface: '#161F30',
			border: '#2A3547',
			text: '#F6F9FC',
			muted: '#A3ADBB',
			brand: '#51A2FF',
			brandText: '#8EC5FF',
		},
	},
	spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 },
	radii: { sm: 4, md: 6, lg: 8, xl: 12, full: 9999 },
	control: { height: 48, minTouch: 44 },
	typography: {
		display: { fontSize: 24, lineHeight: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
		h1: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.2 },
		h2: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
		kpi: { fontSize: 24, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
		body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
		bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
		caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
		overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.55 },
	},
	shadow: {
		sm: { shadowColor: '#1E2735', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
		lg: { shadowColor: '#1E2735', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
	},
} as const

export type AppTheme = typeof theme
```

---

## 9. Migração v3.0 (ouro) → v4.0 (azul) — **aplicada**

Referência viva em **`/design-system`** (`src/pages/(auth)/design-system/`): tokens, tipografia, raio, sombra, espaçamento, todos os componentes `ui/`, o `Form` com todos os tipos de campo e o `GenericTable`. Tem toggle de tema escuro local para validar os overrides de `.dark`.

| v3.0                                   | v4.0                                                        |
| :------------------------------------- | :---------------------------------------------------------- |
| `gold`, `gold-strong`, `gold-text`, `gold-hover`, `gold-light` | `brand`, `brand-strong`, `brand-text`, `brand-hover`, `brand-light` |
| `taupe`, `taupe-light`                 | `neutral`, `neutral-light`                                  |
| `cta`, `cta-hover`, `cta-active`       | `brand`, `brand-hover`, `brand-active` (primário = marca)   |
| `brand-accent` / `accent` verde        | `success` (`--brand-success`)                               |
| `fase-*` / `bg-plan`, `bg-do`…         | removidos (variantes de `Badge` e demos incluídos)          |
| `Button variant='gold'` / `Badge variant='gold'` | `variant='brand'`                                  |

**Checklist de verificação**

```bash
bun run build
# nenhum resquício da paleta antiga:
rg -n 'gold|taupe|[^a-z]cta[^a-z]|brand-accent|#(C59C3D|A8822D|FBF6E9|8C867C|C25220|A64317)' src/
```

---

## 10. Regras de Review

1. Cor arbitrária em hex/`oklch()` inline dentro de `src/**/*.jsx` → **bloquear**. Só token.
2. `dark:` aplicado a cor de marca → **bloquear**. O tema escuro é resolvido em `.dark` no CSS.
3. Novo interativo sem `focus-visible:ring-ring` → **bloquear**.
4. Status representado só por cor → **bloquear**.
5. `tailwind.config.js`, `postcss.config.js` com plugin tailwind, ou `@apply` de utilitário de marca fora de `@layer base` → **bloquear**.
6. Alteração em `src/components/ui/*` fora de `button.jsx` (variantes) → justificar no PR.
