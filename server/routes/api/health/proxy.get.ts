// server/routes/api/health/proxy.get.ts

export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const { proxyUrl } = config
  const result = await checkProxyConnectivity(proxyUrl)

  if (!result.ok) {
    // 如果检查失败，返回一个 503 Service Unavailable 状态码
    throw createError({
      statusCode: 503,
      statusMessage: 'Proxy Connectivity Check Failed',
      data: result,
    })
  }

  // 检查成功，返回 200 OK
  return {
    message: 'Proxy is connected successfully.',
    details: result,
  }
})
