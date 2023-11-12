import t from 'tap';
import { Reducer, Dispatcher, Decider, createAggregateFactory } from './aggregate';

//////////////////////////////////////
/// Events
//////////////////////////////////////

type ShoppingCartEvent =
  | {
      type: 'ShoppingCartOpened';
      data: {};
    }
  | {
      type: 'ProductItemAddedToShoppingCart';
      data: {
        shoppingCartId: string;
      };
    }
  | {
      type: 'ProductItemRemovedFromShoppingCart';
      data: {
        shoppingCartId: string;
      };
    }
  | {
      type: 'ShoppingCartConfirmed';
      data: {
        shoppingCartId: string;
        confirmedAt: string;
      };
    }
  | {
      type: 'ShoppingCartCanceled';
      data: {
        shoppingCartId: string;
        canceledAt: string;
      };
    };

//////////////////////////////////////
/// Commands
//////////////////////////////////////

type ShoppingCartCommand =
  | {
      type: 'OpenShoppingCart';
      data: {
        shoppingCartId: string;
        clientId: string;
        now: Date;
      };
    }
  | {
      type: 'AddProductItemToShoppingCart';
      data: {
        shoppingCartId: string;
      };
    }
  | {
      type: 'RemoveProductItemFromShoppingCart';
      data: {
        shoppingCartId: string;
      };
    }
  | {
      type: 'ConfirmShoppingCart';
      data: {
        shoppingCartId: string;
        now: Date;
      };
    }
  | {
      type: 'CancelShoppingCart';
      data: {
        shoppingCartId: string;
        now: Date;
      };
    };

//////////////////////////////////////
/// Entity/State
//////////////////////////////////////

type ShoppingCart =
  | {
      status: 'Empty';
    }
  | {
      status: 'Pending';
      productItems: number;
    }
  | {
      status: 'Closed';
    };

const reducer: Reducer<ShoppingCart, ShoppingCartEvent> = {
  ProductItemAddedToShoppingCart(cart, event) {
    if (cart.status != 'Pending') return cart;

    return {
      ...cart,
      productItems: cart.productItems + 1,
    };
  },
  ProductItemRemovedFromShoppingCart(cart, event) {
    if (cart.status != 'Pending') return cart;

    return {
      ...cart,
      productItems: cart.productItems - 1,
    };
  },
  ShoppingCartCanceled(cart, event) {
    if (cart.status != 'Pending') return cart;

    return {
      status: 'Closed',
    };
  },
  ShoppingCartConfirmed(cart, event) {
    if (cart.status != 'Pending') return cart;

    return {
      status: 'Closed',
    };
  },
  ShoppingCartOpened(cart, event) {
    if (cart.status != 'Empty') return cart;

    return {
      productItems: 0,
      status: 'Pending',
    };
  },
};

const dispatcher: Dispatcher<ShoppingCart, ShoppingCartCommand, ShoppingCartEvent> = {
  OpenShoppingCart(state, command) {
    return [
      {
        type: 'ShoppingCartOpened',
        data: {},
      },
    ];
  },
  AddProductItemToShoppingCart(state, command) {
    return [
      {
        type: 'ProductItemAddedToShoppingCart',
        data: {
          shoppingCartId: '123',
        },
      },
    ];
  },
  CancelShoppingCart(state, command) {
    return [
      {
        type: 'ShoppingCartCanceled',
        data: {
          shoppingCartId: '123',
          canceledAt: new Date().toISOString(),
        },
      },
    ];
  },
  ConfirmShoppingCart(state, command) {
    return [
      {
        type: 'ShoppingCartConfirmed',
        data: {
          shoppingCartId: '123',
          confirmedAt: command.data.now.toISOString(),
        },
      },
    ];
  },
  RemoveProductItemFromShoppingCart(state, command) {
    return [
      {
        type: 'ProductItemRemovedFromShoppingCart',
        data: {
          shoppingCartId: '123',
        },
      },
    ];
  },
};

const shoppingCartFactory = createAggregateFactory({
  dispatcher: dispatcher,
  reducer,
  initialState() {
    return {
      status: 'Empty',
    } as const;
  },
});

t.test('happy path', async (t) => {
  const cart = shoppingCartFactory();
  t.equal(cart.allEvents().length, 0);

  {
    cart.dispatch({
      type: 'OpenShoppingCart',
      data: {
        clientId: '123',
        now: new Date(),
        shoppingCartId: '123',
      },
    });

    t.equal(cart.allEvents().length, 1);
    t.same(cart.getState(), {
      productItems: 0,
      status: 'Pending',
    });
  }

  // state
  {
    cart.dispatch({
      type: 'AddProductItemToShoppingCart',
      data: {
        shoppingCartId: '123',
      },
    });

    t.same(cart.getState(), {
      productItems: 1,
      status: 'Pending',
    });

    t.equal(cart.pendingEvents().length, 2);
  }

  // state
  {
    cart.flush();
    t.equal(cart.pendingEvents().length, 0);
    t.same(cart.allEvents(), [
      {
        type: 'ShoppingCartOpened',
        data: {},
      },
      {
        type: 'ProductItemAddedToShoppingCart',
        data: { shoppingCartId: '123' },
      },
    ]);

    t.same(cart.getState(), {
      productItems: 1,
      status: 'Pending',
    });

    t.equal(cart.allEvents().length, 2);
  }
});

t.test('derive from events', async (t) => {
  const cart = shoppingCartFactory([
    {
      type: 'ShoppingCartOpened',
      data: {},
    },
    {
      type: 'ProductItemAddedToShoppingCart',
      data: { shoppingCartId: '123' },
    },
  ]);

  t.same(cart.getState(), {
    productItems: 1,
    status: 'Pending',
  });

  const now = new Date();

  cart.dispatch({
    type: 'ConfirmShoppingCart',
    data: {
      now: now,
      shoppingCartId: '123',
    },
  });

  t.equal(cart.allEvents().length, 3);
  t.same(cart.pendingEvents().length, 1);

  cart.flush();

  t.same(cart.allEvents(), [
    {
      type: 'ShoppingCartOpened',
      data: {},
    },
    {
      type: 'ProductItemAddedToShoppingCart',
      data: { shoppingCartId: '123' },
    },
    {
      type: 'ShoppingCartConfirmed',
      data: {
        confirmedAt: now.toISOString(),
        shoppingCartId: '123',
      },
    },
  ]);
  t.equal(cart.pendingEvents().length, 0);
  t.same(cart.getState(), { status: 'Closed' });
});
