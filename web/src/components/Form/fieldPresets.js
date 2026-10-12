// Presets de fields reutilizáveis entre páginas de CRUD.

/**
 * Campo `status` do banco ('ativo' | 'inativo') renderizado como switch.
 * O valor enviado ao backend continua sendo a string — sem conversão na page.
 */
export const statusField = (overrides = {}) => ({
	name: 'status',
	label: 'Status',
	type: 'switch',
	trueValue: 'ativo',
	falseValue: 'inativo',
	defaultValue: 'ativo',
	description: 'Registros inativos não aparecem nas seleções do sistema.',
	cols: 12,
	...overrides,
})

/** Header de tabela correspondente ao statusField. */
export const statusHeader = (overrides = {}) => ({
	label: 'Status',
	field: 'status',
	type: 'status',
	...overrides,
})

/**
 * Situação do soft delete, que **não** é o campo `status` acima: `status` é
 * decisão de negócio ("esta instituição está ativa?") e a situação é se a linha
 * ainda existe para o sistema. Instituição e estado têm as duas colunas, e por
 * isso as duas podem aparecer na mesma tabela.
 *
 * Lê o campo derivado `ativo`, e não `deleted_at`: a listagem monta
 * `ativo: !linha.deleted_at` porque `deleted_at` só chega preenchido quando a
 * consulta pede os inativos.
 */
export const situacaoHeader = (overrides = {}) => ({
	label: 'Situação',
	field: 'ativo',
	type: 'boolean',
	trueLabel: 'Ativo',
	falseLabel: 'Inativo',
	...overrides,
})
