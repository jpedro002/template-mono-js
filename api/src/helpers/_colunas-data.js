// Colunas de data pura (sem hora) por model do Prisma.
//
// O runtime do Prisma 7 **não** expõe o tipo nativo da coluna:
// `_runtimeDataModel.models[X].fields` traz só `{ name, kind, type }`, e todo
// campo de data aparece como `type: 'DateTime'`, seja `date` ou `timestamp`.
//
// O `adjustTimezone` recua 3 horas de tudo que sai do banco (conversão para
// Brasília). Em coluna `date` não há hora para converter — mover é errar o dia.
// Por isso toda coluna `@db.Date` do schema precisa estar listada aqui.
//
// Formato: `{ NomeDoModel: ['coluna_a', 'coluna_b'] }`. O schema atual (`User`,
// `Card`, ...) não tem nenhuma coluna `@db.Date`.
const COLUNAS_DATA = {}

// Colunas de tipo `timestamp` cujo conteúdo é data pura gravada como meia-noite
// local (por exemplo, vindas de uma carga de outro sistema). Também ficam
// isentas do recuo. Mesmo formato de `COLUNAS_DATA`.
const COLUNAS_DATA_EM_TIMESTAMP = {}

const VAZIO = new Set()

/**
 * Só os `@db.Date` do model.
 *
 * @param {string|null} model nome do model no Prisma, não da tabela
 */
export function colunasDataDe(model) {
	const campos = model && COLUNAS_DATA[model]
	return campos ? new Set(campos) : VAZIO
}

/**
 * Tudo que carrega data e por isso não pode ser recuado: os `@db.Date` mais as
 * colunas `timestamp` que guardam meia-noite local. É o que `adjustTimezone`
 * consulta.
 *
 * @param {string|null} model nome do model no Prisma, não da tabela
 */
export function colunasIsentasDeFuso(model) {
	if (!model) return VAZIO
	const campos = [
		...(COLUNAS_DATA[model] ?? []),
		...(COLUNAS_DATA_EM_TIMESTAMP[model] ?? [])
	]
	return campos.length ? new Set(campos) : VAZIO
}

export { COLUNAS_DATA, COLUNAS_DATA_EM_TIMESTAMP }
