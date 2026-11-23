import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [baseUrl] = process.argv.slice(2)
const endpoint = new URL('/api/n8n/neural/events', baseUrl)
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
  throw new Error('Informe a origem HTTPS do CMS de homologação.')
}
const source = JSON.parse(readFileSync(new URL(
  '../workflows/n8n/editorial/IFjhJUTCGPTlo4db.json', import.meta.url
), 'utf8'))
const workflow = {
  name: 'Redação Neural · Apuração de Política (homologação)',
  active: false,
  nodes: source.nodes,
  connections: source.connections,
  settings: { executionOrder: 'v1' }
}
const reportingNode = workflow.nodes.find(node => node.name === 'Apurar documentos')
reportingNode.parameters.options.maxTokens = 4096
const link = node => ({ node, type: 'main', index: 0 })
function add(name, type, typeVersion, parameters, position, options = {}) {
  workflow.nodes.push({ id: randomUUID(), name, type: 'n8n-nodes-base.' + type,
    typeVersion, parameters, position, ...options })
}

function telemetry(after, stage, event, failed = false) {
  const origin = workflow.nodes.find(node => node.name === after)
  const [x, y] = origin.position
  const label = stage + ' · ' + event + (failed ? ' · ' + after : '')
  const prepare = 'Preparar evento · ' + label
  const sign = 'Assinar ' + label
  const send = 'Enviar ' + label
  add(prepare, 'code', 2, { jsCode: `
const occurred_at = new Date().toISOString();
const timestamp = String(Math.floor(Date.parse(occurred_at) / 1000));
const body = JSON.stringify({
  schema_version: 1,
  correlation_id: 'politica-distrital-misto-2026-11',
  execution_id: String($execution.id),
  agent_id: 'reporter_politica',
  source_type: 'n8n',
  source_id: 'politica-documental-staging',
  event_type: ${JSON.stringify(event)},
  stage: ${JSON.stringify(stage)},
  occurred_at${event === 'dossier.ready' ? `,
  dossier: {
    findings: $json.findings,
    source_results: $json.source_results,
    open_questions: $json.open_questions
  }` : ''}
});
return [{ json: { body, timestamp } }];
`.trim() }, [x + 100, y - 260])
  add(sign, 'crypto', 2, {
    action: 'hmac', type: 'SHA256', encoding: 'hex', dataPropertyName: 'signature',
    value: '={{ $json.timestamp + "." + $json.body }}'
  }, [x + 300, y - 260], {
    credentials: { crypto: { name: 'Redação Neural · assinatura homologação' } }
  })
  add(send, 'httpRequest', 4.2, {
    method: 'POST', url: endpoint.href,
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, headerParameters: { parameters: [
      { name: 'X-Neural-Signature', value: '={{ $json.signature }}' },
      { name: 'X-Neural-Timestamp', value: '={{ $json.timestamp }}' }
    ] },
    sendBody: true, contentType: 'raw', rawContentType: 'application/json',
    body: '={{ $json.body }}',
    options: {
      timeout: 4000,
      redirect: { redirect: { followRedirects: false } },
      response: { response: { fullResponse: true } }
    }
  }, [x + 500, y - 260], {
    onError: 'continueRegularOutput',
    credentials: { httpHeaderAuth: { name: 'Redação Neural · CMS homologação' } }
  })
  const outputs = (workflow.connections[after] ??= { main: [[]] }).main
  workflow.connections[prepare] = { main: [[link(sign)]] }
  if (failed) {
    origin.onError = 'continueErrorOutput'
    outputs[1] = [link(prepare)]
    const stop = 'Encerrar com falha · ' + after
    add(stop, 'stopAndError', 1, {
      errorMessage: 'O piloto encontrou uma falha na etapa ' + stage + '. Consulte o nó ' + after + '.'
    }, [x + 700, y - 260])
    workflow.connections[send] = { main: [[link(stop)]] }
    // Preserve the original execution failure even when telemetry fails.
    workflow.nodes.find(node => node.name === prepare).onError = 'continueErrorOutput'
    workflow.connections[prepare].main.push([link(stop)])
    workflow.nodes.find(node => node.name === sign).onError = 'continueErrorOutput'
    workflow.connections[sign] = { main: [[link(send)], [link(stop)]] }
    return
  }
  for (const name of [prepare, sign]) {
    workflow.nodes.find(node => node.name === name).onError = 'continueErrorOutput'
  }
  outputs[0].unshift(link(prepare))
  workflow.connections[sign] = { main: [[link(send)]] }
}

telemetry('Definir missão', 'mission', 'execution.started')
telemetry('Validar modelo', 'model', 'step.completed')
telemetry('Preparar apuração', 'sources', 'step.completed')
telemetry('Apurar documentos', 'reporting', 'step.completed')
telemetry('Conferir evidências', 'evidence', 'dossier.ready')
telemetry('Entregar dossiê e rascunhos', 'drafts', 'execution.completed')

for (const [stage, nodes] of [
  ['model', ['Confirmar acesso ao Luna', 'Validar modelo']],
  ['sources', ['Preparar apuração']],
  ['reporting', ['Apurar documentos']],
  ['evidence', ['Conferir evidências']],
  ['drafts', ['Preparar briefing A', 'Redator A', 'Preparar briefing B', 'Redator B',
    'Entregar dossiê e rascunhos']]
]) {
  for (const node of nodes) telemetry(node, stage, 'execution.failed', true)
}

const deliver = 'Entregar dossiê e rascunhos'
const [lastX, lastY] = workflow.nodes.find(node => node.name === deliver).position
add('Resultado do piloto', 'code', 2, { jsCode: 'return $input.all();' }, [lastX + 350, lastY])
workflow.connections[deliver].main[0].push(link('Resultado do piloto'))
process.stdout.write(JSON.stringify(workflow, null, 2) + '\n')
