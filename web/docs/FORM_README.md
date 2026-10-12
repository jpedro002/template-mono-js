# Form Component — Documentação

Formulário dinâmico para React Web. Define os campos por array de objetos; validação Zod e valores padrão são gerados automaticamente. Construído sobre React Hook Form + Zod + shadcn/ui.

- **Componente:** `src/components/Form/FormWeb.jsx` (export default `Form`)
- **Campos:** `src/components/Form/FormFieldsWeb/`
- **Schema builder / helpers:** `src/components/Form/buildFormSchema.js`

```jsx
import Form from 'src/components/Form/FormWeb'
```

## 🚀 Tipos de campo

| Tipo | Descrição |
|------|-----------|
| `text` `email` `password` `tel` | Inputs de texto. `text` suporta `multiline` e `mask`. |
| `number` | Numérico. **Coagido para `number` no submit.** |
| `currency` | Moeda BRL (máscara `R$`). **Coagido para `number` (reais) no submit;** aceita `number` no prefill. |
| `date` `datetime` | Seletor de data / data-hora. Guarda `"yyyy-MM-dd"` / `"yyyy-MM-dd HH:mm"`; aceita ISO no prefill. |
| `boolean` | Dois botões (Sim/Não). `opcoes` customiza os rótulos. |
| `switch` | Toggle inline com `description`. |
| `checkbox` | Checkbox único com `description`. |
| `radio` | Lista de opções (seleção única). |
| `picker` | Select dropdown. |
| `searchPicker` | Select com busca em dialog (single/`multiSelect`). |
| `checkboxGroup` | Múltiplos checkboxes → array. |
| `fieldArray` | Arrays dinâmicos de subcampos. |
| `label` | Separador de seção (só texto). |
| `button` | Botão arbitrário. |
| `custom` | Render livre. |
| `hidden` | Campo oculto. |

> Máscara automática em `text`/`tel` quando `name` contém `cpf`, `cnpj`, `cep`, `telefone` ou `celular`.

## 📖 Props do `<Form>`

| Prop | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `fields` | `Array` | `[]` | Definição dos campos |
| `schema` | `ZodSchema` | auto | Schema Zod manual (sobrescreve o gerado) |
| `data` | `Object` | `null` | Dados iniciais (prefill / edição) |
| `onSubmit` | `Function` | noop | `(data) => void` — recebe valores já validados/coagidos |
| `onChange` | `Function` | noop | `(values) => void` a cada mudança |
| `isLoading` | `Boolean` | `false` | Loading do botão submit |
| `submitLabel` | `String` | `"Salvar"` | Texto do botão |
| `showSubmitButton` | `Boolean` | `true` | Exibe botão submit |
| `showRequiredIndicator` | `Boolean` | `true` | Exibe legenda de obrigatório |
| `validationMode` | `String` | `"onSubmit"` | Modo RHF: `onSubmit`/`onChange`/`onBlur`/`onTouched`/`all` |
| `ref` | `React.Ref` | — | Expõe `{ reset, setValue, watch, getValues }` |

## 🧩 Propriedades comuns de campo

| Propriedade | Tipo | Descrição |
|------------|------|-----------|
| `name` | `String` | **Obrigatório** (exceto `label`/`button`/`custom`). Chave nos dados |
| `type` | `String` | **Obrigatório.** Veja tabela de tipos |
| `label` | `String` | Rótulo acima do campo |
| `required` | `Boolean` | Campo obrigatório |
| `requiredMessage` | `String` | Mensagem de erro custom |
| `cols` | `Number` | Largura no grid 1–12 (padrão 12) |
| `description` | `String` | Texto de ajuda sob o label |
| `visibleIf` | `Object` | Visibilidade condicional (veja abaixo) |
| `editable` | `Boolean` | `false` → exibição somente-leitura (cadeado) |
| `hidden` | `Boolean` | Não renderiza |
| `defaultValue` | `Any` | Valor inicial |
| `onChange` | `Function` | `(value, { setValue, watch }) => void` |
| `className` | `String` | Classes extras no **wrapper** (célula do grid) |
| `labelClassName` | `String` | Classes extras no **label** |
| `inputClassName` | `String` | Classes extras no **controle** (input, trigger, grupo de opções) |

### 🎨 Estilo por campo

Três alvos separados porque cada campo é uma pilha `wrapper > label > controle` — mexer em um não deve afetar os outros. Todas as classes passam por `cn()`, então conflitam corretamente com as classes padrão (tailwind-merge).

```js
{
  name: 'valor', label: 'Valor', type: 'currency', cols: 6,
  className: 'self-end',                    // wrapper
  labelClassName: 'text-primary uppercase', // label
  inputClassName: 'text-right',             // input
}
```

Em `type: 'label'` (separador de seção), `labelClassName` estiliza o texto. Em `fieldArray`, `className`/`labelClassName`/`inputClassName` valem também para os subcampos.

## 🔀 Visibilidade condicional (`visibleIf`)

Objeto declarativo (não função). A mesma avaliação roda no render **e** no schema — campo oculto não dispara `required`.

```js
{
  name: 'cpf', label: 'CPF', type: 'text', required: true,
  visibleIf: { field: 'tipoPessoa', operator: 'equals', value: 'PF' },
}
```

Operadores: `equals`, `notEquals`, `contains`, `notContains`, `greaterThan`, `lessThan`.

## ⚙️ Propriedades por tipo

### text / email / password / tel / number
```js
{ name: 'campo', type: 'text', placeholder: '...', minLength: 3, maxLength: 100,
  multiline: true /* só text */, mask: (v) => v /* só text */ }
```

### currency
```js
{ name: 'valor', type: 'currency', required: true }
// submit -> number em reais (ex: 1234.56). prefill aceita number.
```

### date / datetime
```js
{ name: 'nascimento', type: 'date', noFutureDate: true, showCurrentButton: true }
```

### boolean / switch / checkbox
```js
{ name: 'ativo', type: 'switch', description: 'Define se está ativo' }
{ name: 'aceite', type: 'boolean', opcoes: ['Sim', 'Não'] }
{ name: 'termos', type: 'checkbox', required: true, mustBeTrue: true,
  mustBeTrueMessage: 'Você precisa aceitar' }
```

### radio / picker / checkboxGroup
```js
{ name: 'tipo', type: 'radio', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }
{ name: 'status', type: 'picker', options: [{ label: 'Ativo', value: 1 }] }
{ name: 'tags', type: 'checkboxGroup', required: true, options: [...] } // -> array
```

### searchPicker
```js
{ name: 'categorias', type: 'searchPicker', multiSelect: true, searchable: true,
  options: [...], searchPlaceholder: 'Buscar...', emptyMessage: 'Nada encontrado' }
```

### Opções dinâmicas via API (`optionsSource`) — picker/searchPicker/radio/checkboxGroup
```js
{
  name: 'cidade', type: 'picker',
  optionsSource: {
    url: '/api/cidades',
    dependsOn: 'estado',     // refaz fetch quando 'estado' muda
    queryParam: 'uf',        // ?uf=<valor>
    resultKey: 'data.items', // caminho aninhado (default: results/data/items)
    labelKey: 'nome', valueKey: 'id',
  },
}
```

### fieldArray
```js
{ name: 'items', type: 'fieldArray', label: 'Itens', minRows: 1, maxRows: 10,
  addButtonLabel: 'Adicionar', removeButtonLabel: 'Remover',
  fields: [
    { name: 'descricao', type: 'text', label: 'Descrição', required: true },
    { name: 'qtd', type: 'number', label: 'Qtd', required: true },
  ] }
```

### label / button / custom
```js
{ type: 'label', label: 'Dados de contato' }
{ type: 'button', label: 'Ação', onPress: () => {}, renderAfter: () => <Hint /> }
{ name: 'x', type: 'custom', render: ({ control, errors, setValue, watch }) => <MeuCampo /> }
```

## 🎯 Exemplos

### Básico + grid
```jsx
const fields = [
  { name: 'nome', label: 'Nome', type: 'text', required: true, cols: 6 },
  { name: 'email', label: 'E-mail', type: 'email', required: true, cols: 6 },
  { name: 'obs', label: 'Observações', type: 'text', multiline: true, cols: 12 },
]
;<Form fields={fields} onSubmit={(d) => console.log(d)} />
```

### Edição (prefill)
```jsx
<Form fields={fields} data={registro} onSubmit={salvar} submitLabel="Salvar Alterações" />
```

### Schema Zod manual (sobrescreve o gerado)
```jsx
const schema = z.object({
  senha: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmar: z.string(),
}).refine((d) => d.senha === d.confirmar, { message: 'Senhas não coincidem', path: ['confirmar'] })

<Form fields={fields} schema={schema} onSubmit={salvar} />
```

### Controle imperativo via ref
```jsx
const ref = useRef()
// ref.current.reset() / setValue(name, v) / watch() / getValues()
<Form ref={ref} fields={fields} onSubmit={salvar} />
```

## 🎨 Notas

- **Coerção no submit:** `number` → `number`; `currency` → `number` (reais). Os demais permanecem string/array/boolean.
- **Grid:** o `<form>` é `grid grid-cols-12`; cada campo vira `col-span-12 md:col-span-{cols}`. As classes são **literais estáticas** — Tailwind v4 detecta sem precisar de safelist.
- **Mensagens custom:** sob zod v4 use `requiredMessage` no campo (o builder traduz para `{ error }` internamente).

## 🤝 Adicionar um novo tipo de campo

1. Crie o componente em `src/components/Form/FormFieldsWeb/`
2. Exporte em `FormFieldsWeb/index.js`
3. Adicione o `case` no `FormField.jsx`
4. Adicione o schema em `buildSubFieldSchema` (`buildFormSchema.js`)
5. Adicione o valor padrão em `buildDefaultValues`
