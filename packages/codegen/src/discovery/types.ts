export interface ContractSource {
  query: string | null;
  body: string | null;
  response: string;
}

export interface ContractDescriptor {
  name: string | undefined;
  contractSource: ContractSource;
}

export interface RouteDescriptor {
  method: string;
  path: string;
  name: string;
  params: Array<{ name: string; source: 'path' | 'query' | 'body' | 'header' }>;
  contract?: ContractDescriptor;
}
