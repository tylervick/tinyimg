// Response types
type BaseResponse = {
  id: string;
};

type SuccessResponse<T> = BaseResponse & {
  data: T;
  error?: undefined;
};

type ErrorResponse = BaseResponse & {
  error: Error;
  data?: undefined;
};

// Request types
type BaseRequest = {
  id: string;
};

// Response types for main thread -> worker communication
export type WorkerResponse<T> = SuccessResponse<T> | ErrorResponse;

// Public request types sent from main thread to worker
export type WorkerInitRequest = BaseRequest & {
  type: 'init';
  input: WebAssembly.Module;
};

export type WorkerConvertRequest = BaseRequest & {
  type: 'convert';
  input: File;
};

// Union of all request types
export type WorkerRequest = WorkerInitRequest | WorkerConvertRequest;
