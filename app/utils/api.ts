/**
 * 一个自定义的 ofetch 实例，用于与我们的后端 API 通信。
 *
 * - 设置了 baseURL，这样我们就不用在每次调用时都写 `/api`。
 * - 最重要的是，它是一个独立的实例，不会被可能存在的全局 onResponseError 钩子影响。
 * - 它将保留 ofetch 的默认行为：在遇到 4xx/5xx 错误时抛出异常，
 *   这正是我们在表单验证中需要的。
 */
export const apiFetch = $fetch.create({
  baseURL: '/api',
  onResponseError({ response }) {
    if (response.status === 400)
      throw response._data
    else
      console.error('apiFetch error:', response)
  },
})
