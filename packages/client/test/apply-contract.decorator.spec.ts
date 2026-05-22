import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Controller } from '@nestjs/common';
import { z } from 'zod';
import { ApplyContract } from '../src/contract/apply-contract.decorator.js';
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
  list() { return []; }

  @ApplyContract(CreateUser)
  create() { return {}; }

  @ApplyContract(UpdateUser)
  update() { return {}; }

  @ApplyContract(PatchUser)
  patch() { return {}; }

  @ApplyContract(DeleteUser)
  delete() { return {}; }
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
