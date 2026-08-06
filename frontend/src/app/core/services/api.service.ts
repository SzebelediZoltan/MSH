import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export const API_BASE_URL = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${API_BASE_URL}${path}`, { params });
  }

  getText(path: string, params?: HttpParams): Observable<string> {
    return this.http.get(`${API_BASE_URL}${path}`, { params, responseType: 'text' });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(`${API_BASE_URL}${path}`, body);
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(`${API_BASE_URL}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${API_BASE_URL}${path}`);
  }

  uploadWithProgress<T>(path: string, formData: FormData): Observable<HttpEvent<T>> {
    const request = new HttpRequest('POST', `${API_BASE_URL}${path}`, formData, {
      reportProgress: true,
      responseType: 'json',
    });
    return this.http.request<T>(request);
  }

  getThumbnailUrl(modelId: string): Observable<string | null> {
    return this.http.get(`${API_BASE_URL}/models/${modelId}/thumbnail`, {
      responseType: 'blob',
    }).pipe(
      map((blob) => URL.createObjectURL(blob)),
    );
  }

  getProjects(): Observable<any[]> {
    return this.get<any[]>('/projects');
  }

  getAllModels(): Observable<any[]> {
    return this.get<any[]>('/models');
  }

  updateProfile(data: { name?: string; email?: string }): Observable<any> {
    return this.patch<any>('/users/me', data);
  }

  uploadAvatar(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    const req = new HttpRequest('POST', `${API_BASE_URL}/users/me/avatar`, fd);
    return this.http.request<any>(req);
  }

  deleteAvatar(): Observable<any> {
    return this.delete<any>('/users/me/avatar');
  }

  changePassword(data: { currentPassword: string; newPassword: string }): Observable<any> {
    return this.post<any>('/users/me/password', data);
  }

  deleteAccount(): Observable<any> {
    return this.delete<any>('/users/me');
  }
}
