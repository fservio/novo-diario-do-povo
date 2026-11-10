export const aiColumns={
 'planalto-central':{name:'Planalto Central',category:'politica'},
 'painel-economico':{name:'Painel Econômico',category:'economia'},
 internacional:{name:'Internacional',category:'mundo'}
} as const

export function aiColumnDisclosure(slug:string|undefined){
 const column=slug&&Object.hasOwn(aiColumns,slug)?aiColumns[slug as keyof typeof aiColumns]:null
 return column?column.name+' é uma coluna produzida por inteligência artificial a partir da cobertura do Diário do Povo.':''
}
