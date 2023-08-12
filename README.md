# typed-ddd

Small typed ddd library which gives full type-safety

## Usage

```ts
// example of the usage

import { TypeBox, createAdapter, createDomain } from 'typed-ddd';

// Create domain with events and procedures (/commands)
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
    // ctx can be used to have "DI"
    async createAccount(factory, input: { works: string }, ctx: { id: string }) {
      return {
        events: [factory.account_created({ id: input.works })],
        data: {
          awda: 'works',
        },
      };
    },
    async deleteAccount(
      factory,
      input: { acc_id: string },
      ctx: { getAccount: (acc_id: string) => Promise<{ id: string } | null> }
    ) {
      if (await ctx.getAccount(input.acc_id)) {
        return {
          events: [factory.account_deleted({ deleted_id: input.acc_id })],
          data: {
            awda: 'works',
          },
        };
      }

      return {
        data: null,
        events: [],
      };
    },
  },
});

type SqlCommand = { sql: string; paramaters?: unknown[] };

// Create SQL adapter
const sqlAdapter = createAdapter(domain)<SqlCommand>({
  account_created: ({ data }) => [{ sql: 'INSERT INTO accounts VALUES($1)', paramaters: [data.id] }],
  account_deleted: ({ data }) => [{ sql: 'DELETE FROM accounts WHERE $1', paramaters: [data.deleted_id] }],
});

async function commit(_commands: ReadonlyArray<SqlCommand>) {
  // run some db query
}

async function deleteReqHandler() {
  const result = await sqlAdapter.handlers.deleteAccount(
    { acc_id: '123' },
    {
      getAccount(acc_id) {
        return Promise.resolve({ id: acc_id });
      },
    }
  );

  await commit(result.effects);

  return result.data;
}
```
