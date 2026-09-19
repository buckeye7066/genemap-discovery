import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { executeJob, probeProvider } from './officialCli.mjs'

// Heartbeats do not spawn native CLIs repeatedly. Each job still rechecks auth.
export function createProviderStatusCache({ now = Date.now, probe = probeProvider } = {}) {
  let checkedAt = -Infinity
  let providers = { codex: 'unavailable' }
  return {
    async read(options = {}) {
      const time = now()
      if (time >= checkedAt && time - checkedAt < 30000) return { ...providers }
      const states = await Promise.all(['codex'].map(async provider => {
        try { return await probe(provider, options) } catch { return 'unavailable' }
      }))
      providers = { codex: states[0] }
      checkedAt = now()
      return { ...providers }
    },
  }
}

export function bridgeConfig(env = process.env) {
  const url = new URL(env.OWNER_AI_URL)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid_configuration')
  if (!env.OWNER_AI_BRIDGE_TOKEN || env.OWNER_AI_BRIDGE_TOKEN.length < 32) throw new Error('invalid_configuration')
  return { url, token: env.OWNER_AI_BRIDGE_TOKEN }
}
export async function deliverResult(post,body,{deadline,signal,now=Date.now,wait=delay}={}) {
  while(!signal?.aborted&&now()<deadline){
    try{const reply=await post('result',body,signal);return reply?.received===true}
    catch(error){if([400,401,403,409,410,413].includes(error?.status))return false}
    const remaining=deadline-now();if(remaining<=0)return false
    try{await wait(Math.min(250,remaining),undefined,{signal})}catch{return false}
  }
  return false
}

export async function runBridge({ env = process.env, signal } = {}) {
  const { url, token } = bridgeConfig(env)
  const providerStatus = createProviderStatusCache()
  async function post(route, body, requestSignal = signal) {
    const response = await fetch(new URL('/api/owner-ai/worker/' + route, url), {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(5000), ...(requestSignal ? [requestSignal] : [])]),
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('unavailable'),{status:response.status}) }
    let size = 0
    const chunks = []
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > 196608) throw new Error('unavailable')
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString())
  }
  while (!signal?.aborted) {
    try {
      const probeSignal = AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])])
      const providers = await providerStatus.read({ env, signal: probeSignal })
      const { job } = await post('poll', { providers })
      if (job) {
        if (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > 120000 ||
            typeof job.prompt !== 'string' || typeof job.system !== 'string' ||
            !Number.isInteger(job.maxTokens) || job.maxTokens < 2) throw new Error('invalid_job')
        const deadline=Date.now()+job.timeoutMs
        const controller = new AbortController()
        const jobSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(job.timeoutMs), ...(signal ? [signal] : [])])
        const monitor = (async () => {
          try {
            while (!jobSignal.aborted) {
              await delay(1000, undefined, { signal: jobSignal })
              const reply = await post('poll', { providers, active: { id: job.id, lease: job.lease } }, jobSignal)
              if (!reply.active) controller.abort()
            }
          } catch { controller.abort() }
        })()
        try {
          const result = await executeJob(job, { env, signal: jobSignal })
          if (!jobSignal.aborted) await deliverResult(post,{id:job.id,lease:job.lease,result},{deadline,signal:jobSignal})
        } finally {controller.abort();await monitor}
      }
    } catch {
      // Never log prompts, results, native status output, or credentials.
    }
    await delay(1500, undefined, { signal }).catch(() => {})
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const controller = new AbortController()
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => controller.abort())
  runBridge({ signal: controller.signal }).catch(() => { process.exitCode = 1 })
}
