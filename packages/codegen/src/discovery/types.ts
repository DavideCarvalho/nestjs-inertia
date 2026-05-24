export interface TypeRef {
  name: string;
  filePath: string;
  isArray?: boolean;
}

export interface ContractSource {
  query: string | null;
  body: string | null;
  response: string;
  queryRef?: TypeRef | null;
  bodyRef?: TypeRef | null;
  responseRef?: TypeRef | null;
}

export interface ContractDescriptor {
  contractSource: ContractSource;
}

export interface ControllerRef {
  className: string;
  methodName: string;
  filePath: string;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
  contract?: ContractDescriptor;
  controllerRef?: ControllerRef;
}
