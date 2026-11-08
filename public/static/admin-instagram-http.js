(() => {
  async function readJson(response) {
    const sessionMessage = 'Sua sessão expirou. Entre novamente em outra aba e tente de novo; seus campos e o áudio continuam nesta tela.'
    if (response.status === 401 || response.redirected) throw new Error(sessionMessage)
    if (!(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      if (response.status === 403) throw new Error('O envio foi recusado pela proteção da sessão (403). Entre novamente em outra aba e tente de novo.')
      throw new Error(`O servidor não retornou a resposta esperada (HTTP ${response.status}). Tente novamente em alguns instantes.`)
    }
    let data
    try { data = await response.json() }
    catch { throw new Error('O servidor retornou uma resposta incompleta. Tente novamente.') }
    if (!response.ok) throw new Error(data.error || `Não foi possível concluir a solicitação (HTTP ${response.status}).`)
    return data
  }
  window.DiarioInstagramHttp = { readJson }
})()
