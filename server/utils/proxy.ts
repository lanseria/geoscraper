// server/utils/proxy.ts
import type { Agent } from 'undici'
import { ofetch } from 'ofetch'
import { ProxyAgent } from 'undici'

interface ProxyCheckResult {
  ok: boolean
  status?: number
  error?: string
}

/**
 * 检查指定的 HTTP 代理服务器是否可以连通外部网络。
 *
 * @param proxyUrl 代理服务器的 URL，例如 'http://172.17.0.1:7897'
 * @param targetUrl 测试的目标 URL，默认为一个轻量级的 '204' 端点
 * @returns 一个包含检查结果的对象 { ok: boolean, status?: number, error?: string }
 */
export async function checkProxyConnectivity(
  proxyUrl: string,
  targetUrl = 'http://www.google.com/generate_204',
): Promise<ProxyCheckResult> {
  // 如果没有提供代理地址，则直接返回失败
  if (!proxyUrl) {
    return { ok: false, error: 'Proxy URL is not provided.' }
  }

  let dispatcher
  try {
    dispatcher = new ProxyAgent(proxyUrl)
  }
  catch (e: any) {
    return { ok: false, error: `Invalid proxy URL format: ${e.message}` }
  }

  try {
    const response = await ofetch.raw(targetUrl, {
      // 核心：使用 HEAD 方法，只获取响应头
      method: 'HEAD',
      // 核心：指定请求通过代理分发
      dispatcher,
      // 设置一个合理的超时时间，防止长时间等待
      timeout: 5000, // 5秒
      // 不自动重试，我们只想知道第一次是否成功
      retry: 0,
    })

    // 只要能收到 HTTP 响应（即使是 4xx 或 5xx），就说明代理本身是通的。
    // 204 是我们期望的最佳结果。
    return { ok: true, status: response.status }
  }
  catch (error: any) {
    // 捕获所有 ofetch 抛出的错误，这些通常是网络层面的问题
    // (例如：连接代理失败、DNS解析失败、超时等)
    const errorMessage = error.cause?.message || error.message || 'Unknown network error'
    return { ok: false, error: errorMessage }
  }
}
