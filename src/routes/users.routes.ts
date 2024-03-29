import express, { Router, Request, Response } from 'express';
import BadRequest400Error from '../errors/bad-request-400.error';
import Internal500Error from '../errors/internal-500.error';
import NotAuthorized403Error from '../errors/not-authorized-403.error';
import NotFound404Error from '../errors/not-found-404.error';
import { checkIsAdmin, checkIsCurrentUser } from '../middleware/auth';
import { Order } from '../models/order';
import { OrderStatus } from '../models/order-status.type';
import {
  OrderStore,
  validateCreateOrder,
  validateOrder,
  validateOrderItem,
} from '../models/order.store';
import { Product } from '../models/product';
import { ProductStore } from '../models/product.store';
import { OrderItem } from '../models/order-item';
import { User } from '../models/user';
import { UserInput } from '../models/user-input';
import { UserStore, validateUser, validateUserInput } from '../models/user.store';
import { isANumber, queryToNumber } from '../services/common-validation.service';

const router: Router = express.Router();
const productStore = new ProductStore();
const INVALID_USER_ID = 'The user id is not a valid number';
const INVALID_ORDER_ID = 'The order id is not a valid number';
const INVALID_ORDER_ITEM_ID = 'The order item id is not a valid number';
const USER_NOT_FOUND = 'The user with the given id was not found';
const ORDER_NOT_FOUND = 'The order with the given id was not found';
const ORDER_ITEM_NOT_FOUND = 'The order item with the given id was not found';
const PRODUCT_NOT_FOUND = 'The product with the given id was not found';
const ORDER_ALREADY_COMPLETED = 'Updating an order that is not active is not allowed';

router.get('/', checkIsAdmin, async (_req: Request, res: Response) => {
  let users: User[];
  try {
    users = await UserStore.index();
  } catch (_error) {
    return res.status(500).send(new Internal500Error('Could not get the users'));
  }

  return res.send(users);
});

router.get('/:userId', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { userId: qUserId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }

  const userId: number = queryToNumber(qUserId);
  const user: User | undefined = await UserStore.show(userId);

  if (!user) {
    return res.status(404).send(new NotFound404Error(USER_NOT_FOUND));
  }

  return res.send(user);
});

/**
 * This route is used for new registration
 */
router.post('/', async (req: Request, res: Response) => {
  const { error } = validateUserInput(req.body);
  if (error) {
    return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
  }

  try {
    const { email, firstName, lastName, password } = req.body as UserInput;
    const userFound: User | undefined = await UserStore.showByEmail(email);
    if (userFound) {
      return res.status(400).send(new BadRequest400Error('A user already exists with this email'));
    }

    const user: User | undefined = await UserStore.create({ email, firstName, lastName, password });

    if (!user) {
      return res
        .status(500)
        .send(new Internal500Error('An unexpected error occurred during the creation of the user'));
    }

    return res.status(201).send(user);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return res
      .status(500)
      .send(
        new Internal500Error(
          `An unexpected error occurred during the creation of the user. ${err?.message ?? ''}`
        )
      );
  }
});

router.put('/:userId', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { userId: qUserId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }

  const { error } = validateUser(req.body);
  if (error) {
    return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
  }

  const userId: number = queryToNumber(qUserId);
  const { firstName, lastName, email } = req.body;
  const user: User | undefined = await UserStore.show(userId);

  if (!user) {
    return res.status(404).send(new NotFound404Error(USER_NOT_FOUND));
  }
  try {
    const updatedUser: User | undefined = await UserStore.update(userId, {
      firstName,
      lastName,
      email,
    });

    if (!updatedUser) {
      return res
        .status(500)
        .send(new Internal500Error('An unexpected error occurred when trying to update the user'));
    }

    return res.send(updatedUser);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return res
      .status(500)
      .send(
        new Internal500Error(
          `An unexpected error occurred when trying to update the user. ${err?.message ?? ''}`
        )
      );
  }
});

router.delete('/:userId', checkIsAdmin, async (req: Request, res: Response) => {
  const { userId: qUserId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }

  const userId: number = queryToNumber(qUserId);
  const user: User | undefined = await UserStore.show(userId);

  if (!user) {
    return res.status(404).send(new NotFound404Error(USER_NOT_FOUND));
  }

  try {
    const deletedUser: User | undefined = await UserStore.delete(userId);

    if (!deletedUser) {
      return res
        .status(500)
        .send(new Internal500Error('An unexpected error occurred when trying to delete the user'));
    }

    return res.send(deletedUser);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return res
      .status(500)
      .send(
        new Internal500Error(
          `An unexpected error occurred when trying to delete the user. ${err?.message ?? ''}`
        )
      );
  }
});

router.get('/:userId/orders/', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { userId: qUserId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }

  const userId: number = queryToNumber(qUserId);
  const { status }: { status?: OrderStatus } = req.query;
  const orders: Order[] = await OrderStore.indexUserOrders(userId, { status });

  return res.send(orders);
});

router.get('/:userId/orders/:orderId', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { userId: qUserId, orderId: qOrderId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }
  if (!isANumber(qOrderId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ID));
  }

  const userId: number = queryToNumber(qUserId);
  const orderId: number = queryToNumber(qOrderId);
  const order: Order | undefined = await OrderStore.showUserOrder({ userId, orderId });

  if (!order) {
    return res.status(404).send(new NotFound404Error(ORDER_NOT_FOUND));
  }

  return res.send(order);
});

router.post('/:userId/orders/', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { error } = validateCreateOrder(req.body);
  if (error) {
    return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
  }

  try {
    const { userId: qUserId } = req.params;
    const { userId } = req.body as { userId: number };
    if (userId !== +qUserId) {
      return res.status(400).send(new BadRequest400Error('Mismatched user ids'));
    }
    const activeOrder: Order[] = await OrderStore.indexUserOrders(userId, { status: 'active' });
    if (activeOrder.length > 0) {
      return res
        .status(400)
        .send(new BadRequest400Error('Could not create the order: an active order already exists'));
    }

    const order: Order | undefined = await OrderStore.createUserOrder(userId);

    if (!order) {
      return res
        .status(500)
        .send(
          new Internal500Error('An unexpected error occurred during the creation of the order')
        );
    }

    return res.status(201).send(order);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return res
      .status(500)
      .send(
        new Internal500Error(
          `An unexpected error occurred during the creation of the order. ${err?.message ?? ''}`
        )
      );
  }
});

router.put('/:userId/orders/:orderId', checkIsCurrentUser, async (req: Request, res: Response) => {
  const { userId: qUserId, orderId: qOrderId } = req.params;
  if (!isANumber(qUserId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
  }
  if (!isANumber(qOrderId)) {
    return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ID));
  }

  const { error } = validateOrder(req.body);
  if (error) {
    return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
  }

  const order: Order = req.body as Order;
  const { id: orderId, userId, status } = order;
  if (userId !== +qUserId) {
    return res.status(400).send(new BadRequest400Error('Mismatched user ids'));
  }
  if (orderId !== +qOrderId) {
    return res.status(400).send(new BadRequest400Error('Mismatched order ids'));
  }

  const existingOrder: Order | undefined = await OrderStore.showUserOrder({ userId, orderId });
  if (!existingOrder) {
    return res.status(404).send(new NotFound404Error(ORDER_NOT_FOUND));
  }
  if (existingOrder.status !== 'active') {
    return res.status(403).send(new NotAuthorized403Error(ORDER_ALREADY_COMPLETED));
  }
  if (status !== 'complete') {
    return res.status(400).send(new BadRequest400Error('Invalid status for this operation'));
  }

  try {
    const updatedOrder: Order | undefined = await OrderStore.updateUserOrder(orderId, {
      userId,
      status,
    });

    if (!updatedOrder) {
      return res
        .status(500)
        .send(new Internal500Error('An unexpected error occurred when trying to update the order'));
    }

    return res.send(updatedOrder);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return res
      .status(500)
      .send(
        new Internal500Error(
          `An unexpected error occurred when trying to update the order. ${err?.message ?? ''}`
        )
      );
  }
});

router.post(
  '/:userId/orders/:orderId/items',
  checkIsCurrentUser,
  async (req: Request, res: Response) => {
    const { userId: qUserId, orderId: qOrderId } = req.params;
    if (!isANumber(qUserId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
    }
    if (!isANumber(qOrderId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ID));
    }

    const { error } = validateOrderItem(req.body);
    if (error) {
      return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
    }

    const userId: number = queryToNumber(qUserId);
    const orderId: number = queryToNumber(qOrderId);
    const order: Order | undefined = await OrderStore.showUserOrder({ userId, orderId });
    if (!order) {
      return res.status(404).send(new NotFound404Error(ORDER_NOT_FOUND));
    }
    if (order.status !== 'active') {
      return res.status(403).send(new NotAuthorized403Error(ORDER_ALREADY_COMPLETED));
    }

    const { productId, quantity } = req.body as { productId: number; quantity: number };
    const product: Product | undefined = await productStore.show(productId);
    if (!product) {
      return res.status(404).send(new NotFound404Error(PRODUCT_NOT_FOUND));
    }

    try {
      const item: OrderItem | undefined = await OrderStore.addUserOrderItem({
        userId,
        orderId,
        productId,
        quantity,
      });

      if (!item) {
        return res
          .status(500)
          .send(
            new Internal500Error(
              'An unexpected error occurred when trying to add the product to the order'
            )
          );
      }

      return res.status(201).send(item);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      return res
        .status(500)
        .send(
          new Internal500Error(
            `An unexpected error occurred when trying to add the product to the order. ${
              err?.message ?? ''
            }`
          )
        );
    }
  }
);

router.put(
  '/:userId/orders/:orderId/items/:id',
  checkIsCurrentUser,
  async (req: Request, res: Response) => {
    const { userId: qUserId, orderId: qOrderId, id: qId } = req.params;
    if (!isANumber(qUserId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
    }
    if (!isANumber(qOrderId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ID));
    }
    if (!isANumber(qId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ITEM_ID));
    }

    const { error } = validateOrderItem(req.body);
    if (error) {
      return res.status(400).send(new BadRequest400Error(error.details[0]?.message));
    }

    const userId: number = queryToNumber(qUserId);
    const orderId: number = queryToNumber(qOrderId);
    const order: Order | undefined = await OrderStore.showUserOrder({ userId, orderId });

    if (!order) {
      return res.status(404).send(new NotFound404Error(ORDER_NOT_FOUND));
    }
    if (order.status === 'complete') {
      return res.status(403).send(new NotAuthorized403Error(ORDER_ALREADY_COMPLETED));
    }

    const orderItem: OrderItem | undefined = await OrderStore.showUserOrderItem(+qId);
    if (!orderItem) {
      return res.status(404).send(new NotFound404Error(ORDER_ITEM_NOT_FOUND));
    }

    const { id, productId, quantity } = req.body as {
      id: number;
      productId: number;
      quantity: number;
    };
    if (+qId !== id) {
      return res.status(400).send(new BadRequest400Error('Mismatched order item ids'));
    }
    const product: Product | undefined = await productStore.show(productId);
    if (!product || productId !== orderItem.productId) {
      return res.status(400).send(new BadRequest400Error('Mismatched product ids'));
    }

    try {
      const item: OrderItem | undefined = await OrderStore.updateUserOrderItem(id, {
        orderId,
        productId,
        quantity,
      });

      if (!item) {
        return res
          .status(500)
          .send(
            new Internal500Error(
              'An unexpected error occurred when trying to update the product in the order'
            )
          );
      }

      return res.send(item);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      return res
        .status(500)
        .send(
          new Internal500Error(
            `An unexpected error occurred when trying to update the product in the order. ${
              err?.message ?? ''
            }`
          )
        );
    }
  }
);

router.delete(
  '/:userId/orders/:orderId/items/:id',
  checkIsCurrentUser,
  async (req: Request, res: Response) => {
    const { userId: qUserId, orderId: qOrderId, id: qId } = req.params;
    if (!isANumber(qUserId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_USER_ID));
    }
    if (!isANumber(qOrderId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ID));
    }
    if (!isANumber(qId)) {
      return res.status(400).send(new BadRequest400Error(INVALID_ORDER_ITEM_ID));
    }

    const userId: number = queryToNumber(qUserId);
    const orderId: number = queryToNumber(qOrderId);
    const id: number = queryToNumber(qId);
    const order: Order | undefined = await OrderStore.showUserOrder({ userId, orderId });
    if (!order) {
      return res.status(404).send(new NotFound404Error(ORDER_NOT_FOUND));
    }
    if (order.status === 'complete') {
      return res.status(403).send(new NotAuthorized403Error(ORDER_ALREADY_COMPLETED));
    }

    const item: OrderItem | undefined = await OrderStore.showUserOrderItem(id);
    if (!item) {
      return res.status(404).send(new NotFound404Error(ORDER_ITEM_NOT_FOUND));
    }

    try {
      const deletedItem: OrderItem | undefined = await OrderStore.deleteUserOrderItem(id);

      if (!deletedItem) {
        return res
          .status(500)
          .send(
            new Internal500Error(
              'An unexpected error occurred when trying to remove the product from the order'
            )
          );
      }

      return res.send(deletedItem);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      return res
        .status(500)
        .send(
          new Internal500Error(
            `An unexpected error occurred when trying to remove the product from the order. ${
              err?.message ?? ''
            }`
          )
        );
    }
  }
);

export default router;
