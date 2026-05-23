import 'reflect-metadata';
import { BadRequestException, Controller } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApplyContract } from '../src/contract/apply-contract.decorator.js';
import { ContractValidationPipe } from '../src/contract/contract-validation.pipe.js';
import { Contract } from '../src/contract/contract.js';
import { CONTRACT_METADATA } from '../src/contract/metadata.js';

const ListUsers = Contract.get('/users', {
  query: z.object({ q: z.string().optional() }),
  response: z.array(z.object({ id: z.string() })),
  name: 'users.list',
});

const CreateUser = Contract.post('/users', {
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
  name: 'users.create',
});

const UpdateUser = Contract.put('/users/:id', {
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
  name: 'users.update',
});

const PatchUser = Contract.patch('/users/:id', {
  body: z.object({ name: z.string() }),
  response: z.object({ id: z.string() }),
  name: 'users.patch',
});

const DeleteUser = Contract.delete('/users/:id', {
  response: z.object({ ok: z.boolean() }),
  name: 'users.delete',
});

@Controller()
class TestController {
  @ApplyContract(ListUsers)
  list() {
    return [];
  }

  @ApplyContract(CreateUser)
  create() {
    return {};
  }

  @ApplyContract(UpdateUser)
  update() {
    return {};
  }

  @ApplyContract(PatchUser)
  patch() {
    return {};
  }

  @ApplyContract(DeleteUser)
  delete() {
    return {};
  }
}

describe('@ApplyContract', () => {
  describe('GET contract', () => {
    it('attaches path metadata', () => {
      const path = Reflect.getMetadata('path', TestController.prototype.list);
      expect(path).toBe('/users');
    });

    it('attaches HTTP method metadata (RequestMethod.GET = 0)', () => {
      const method = Reflect.getMetadata('method', TestController.prototype.list);
      expect(method).toBe(0); // RequestMethod.GET = 0
    });

    it('attaches the contract object via CONTRACT_METADATA', () => {
      const c = Reflect.getMetadata(CONTRACT_METADATA, TestController.prototype.list);
      expect(c).toBe(ListUsers);
    });
  });

  describe('POST contract', () => {
    it('attaches path metadata', () => {
      const path = Reflect.getMetadata('path', TestController.prototype.create);
      expect(path).toBe('/users');
    });

    it('attaches HTTP method metadata (RequestMethod.POST = 1)', () => {
      const method = Reflect.getMetadata('method', TestController.prototype.create);
      expect(method).toBe(1); // RequestMethod.POST = 1
    });

    it('attaches the contract via CONTRACT_METADATA', () => {
      const c = Reflect.getMetadata(CONTRACT_METADATA, TestController.prototype.create);
      expect(c).toBe(CreateUser);
    });
  });

  describe('PUT contract', () => {
    it('attaches path /users/:id', () => {
      const path = Reflect.getMetadata('path', TestController.prototype.update);
      expect(path).toBe('/users/:id');
    });

    it('attaches HTTP method metadata (RequestMethod.PUT = 2)', () => {
      const method = Reflect.getMetadata('method', TestController.prototype.update);
      expect(method).toBe(2); // RequestMethod.PUT = 2
    });
  });

  describe('PATCH contract', () => {
    it('attaches HTTP method metadata (RequestMethod.PATCH = 4)', () => {
      const method = Reflect.getMetadata('method', TestController.prototype.patch);
      expect(method).toBe(4); // RequestMethod.PATCH = 4
    });
  });

  describe('DELETE contract', () => {
    it('attaches HTTP method metadata (RequestMethod.DELETE = 3)', () => {
      const method = Reflect.getMetadata('method', TestController.prototype.delete);
      expect(method).toBe(3); // RequestMethod.DELETE = 3
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ContractValidationPipe unit tests
// ────────────────────────────────────────────────────────────────────────────
const BodyContract = Contract.post('/items', {
  body: z.object({ name: z.string().min(1) }),
  response: z.object({ id: z.string() }),
});

const QueryContract = Contract.get('/items', {
  query: z.object({ q: z.string() }),
  response: z.array(z.object({ id: z.string() })),
});

describe('ContractValidationPipe', () => {
  describe('body validation', () => {
    const pipe = new ContractValidationPipe(BodyContract);

    it('passes valid body through and returns parsed data', () => {
      const result = pipe.transform({ name: 'hello' }, { type: 'body' });
      expect(result).toEqual({ name: 'hello' });
    });

    it('throws BadRequestException with Zod issues for invalid body', () => {
      expect(() => pipe.transform({ name: '' }, { type: 'body' })).toThrow(BadRequestException);
    });

    it('throws BadRequestException with serialized issues on type mismatch', () => {
      let thrown: unknown;
      try {
        pipe.transform({ name: 123 }, { type: 'body' });
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      const response = (thrown as BadRequestException).getResponse() as Record<string, unknown>;
      expect(response.message).toBe('Contract validation failed');
      expect(Array.isArray(response.issues)).toBe(true);
    });
  });

  describe('query validation', () => {
    const pipe = new ContractValidationPipe(QueryContract);

    it('passes valid query through', () => {
      const result = pipe.transform({ q: 'search' }, { type: 'query' });
      expect(result).toEqual({ q: 'search' });
    });

    it('throws BadRequestException for invalid query', () => {
      expect(() => pipe.transform({}, { type: 'query' })).toThrow(BadRequestException);
    });
  });

  describe('unhandled metadata types', () => {
    const pipe = new ContractValidationPipe(BodyContract);

    it('passes through param values unchanged (no schema for params)', () => {
      const result = pipe.transform('user-id-123', { type: 'param' });
      expect(result).toBe('user-id-123');
    });

    it('passes through custom values unchanged', () => {
      const result = pipe.transform({ anything: true }, { type: 'custom' });
      expect(result).toEqual({ anything: true });
    });
  });

  describe('validate: false (default) — no pipe installed', () => {
    it('does NOT attach PIPES_METADATA when validate is omitted', () => {
      @Controller()
      class Ctrl {
        @ApplyContract(BodyContract)
        handler() {}
      }
      // NestJS stores pipes at 'pipes' metadata key
      const pipes = Reflect.getMetadata('__pipes__', Ctrl.prototype.handler) ?? [];
      expect(pipes).toHaveLength(0);
    });

    it('does NOT attach PIPES_METADATA when validate: false', () => {
      @Controller()
      class Ctrl {
        @ApplyContract(BodyContract, { validate: false })
        handler() {}
      }
      const pipes = Reflect.getMetadata('__pipes__', Ctrl.prototype.handler) ?? [];
      expect(pipes).toHaveLength(0);
    });
  });

  describe('validate: true — pipe is installed', () => {
    it('attaches a ContractValidationPipe instance when validate: true', () => {
      @Controller()
      class Ctrl {
        @ApplyContract(BodyContract, { validate: true })
        handler() {}
      }
      const pipes: unknown[] = Reflect.getMetadata('__pipes__', Ctrl.prototype.handler) ?? [];
      expect(pipes.length).toBeGreaterThan(0);
      expect(pipes.some((p) => p instanceof ContractValidationPipe)).toBe(true);
    });
  });
});
