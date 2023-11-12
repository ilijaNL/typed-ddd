import tap from 'tap';
import { createAdapter, createDomain, TypeBox } from './index';

tap.test('happy path', async ({ same }) => {
  const domain = createDomain({
    // define events
    eventsMap: {
      account_created: TypeBox.Type.Object({
        id: TypeBox.Type.String(),
      }),
      account_deleted: TypeBox.Type.Object({
        deleted_id: TypeBox.Type.String(),
      }),
    },
    // define procedures
    procedures: {
      // define procedures
      async createAccount(factory, input: { works: string }, ctx: { id: string }) {
        return {
          events: [factory.account_created({ id: input.works }), factory.account_deleted({ deleted_id: ctx.id })],
          data: {
            awda: 'works',
          },
        };
      },
    },
  });

  const accResult = await domain.actions.createAccount({ works: '123' }, { id: 'data' });

  same(accResult.data, {
    awda: 'works',
  });
  same(accResult.events[0], { event_name: 'account_created', data: { id: '123' } });
  same(accResult.events[1], { event_name: 'account_deleted', data: { deleted_id: 'data' } });
});

tap.test('validates events payload', async ({ same, rejects, resolveMatch }) => {
  const domain = createDomain({
    createValidationFn: (schema) => {
      return function fn(event_data: any) {
        if (event_data.id.length < 3) {
          throw new Error('not-valid');
        }
      };
    },
    // define events
    eventsMap: {
      account_created: TypeBox.Type.Object({
        id: TypeBox.Type.String(),
      }),
    },
    // define procedures
    procedures: {
      // define procedures
      async createAccount(factory, input: { works: string }, ctx: { id: string }) {
        return {
          events: [factory.account_created({ id: input.works })],
          data: {
            success: 'qweqweqweq',
          },
        };
      },
    },
  });

  rejects(() => domain.actions.createAccount({ works: '1' }, { id: 'data' }));
  resolveMatch(() => domain.actions.createAccount({ works: '1233' }, { id: 'data' }), {
    data: {
      success: 'qweqweqweq',
    },
  });
});

tap.test('happy path adapter', async ({ same }) => {
  const domain = createDomain({
    // define events
    eventsMap: {
      account_created: TypeBox.Type.Object({
        id: TypeBox.Type.String(),
      }),
      account_deleted: TypeBox.Type.Object({
        deleted_id: TypeBox.Type.String(),
      }),
    },
    // define procedures
    procedures: {
      // define procedures
      async createAccount(factory, input: { works: string }, ctx: { id: string }) {
        return {
          events: [factory.account_created({ id: input.works }), factory.account_deleted({ deleted_id: ctx.id })],
          data: {
            awda: 'works',
          },
        };
      },
    },
  });

  const adapter = createAdapter(domain)<{ sql: string }>({
    account_created: ({ data }) => [{ sql: `insert ${data.id}` }, { sql: `side-effect ${data.id}` }],
    account_deleted: ({ data }) => [{ sql: `delete ${data.deleted_id}` }],
  });

  const accResult = await adapter.handlers.createAccount({ works: '123' }, { id: 'ctx' });

  same(accResult.data, {
    awda: 'works',
  });
  // should keep the same order
  same(accResult.effects[0], { sql: 'insert 123' });
  same(accResult.effects[1], { sql: 'side-effect 123' });
  same(accResult.effects[2], { sql: 'delete ctx' });
});
