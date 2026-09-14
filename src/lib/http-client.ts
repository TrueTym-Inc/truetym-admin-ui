// lib/http-client.ts
import { AxiosRequestConfig } from 'axios';

import { apiClient, ApiEnvelope, toFailedEnvelope } from '@/lib/api-client';

async function request<T>(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  path: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiEnvelope<T>> {
  try {
    const response =
      method === 'get' || method === 'delete'
        ? await apiClient[method]<ApiEnvelope<T>>(path, config)
        : await apiClient[method]<ApiEnvelope<T>>(path, body, config);

    if (!response.data?.succeeded) {
      throw new Error(response.data?.message?.join(', ') || 'Request failed');
    }

    return response.data;
  } catch (error) {
    if (error instanceof Error && error.message !== 'Request failed') {
      // Already a plain Error we threw above from a 2xx-but-succeeded:false response
      throw error;
    }
    const failed = toFailedEnvelope(error, `Request to ${path} failed`);
    throw new Error(failed.message.join(', '));
  }
}

export const getJson = <T>(path: string, config?: AxiosRequestConfig) =>
  request<T>('get', path, undefined, config);

export const postJson = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  request<T>('post', path, body, config);

export const patchJson = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  request<T>('patch', path, body, config);

export const putJson = <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
  request<T>('put', path, body, config);

export const deleteJson = <T>(path: string, config?: AxiosRequestConfig) =>
  request<T>('delete', path, undefined, config);
