import {
  type Account,
  type Address,
  type Client,
  type Transport,
  createClient,
  custom,
} from 'viem'

import { parseAccount } from 'viem/utils'
import type { Config, Connection } from '../createConfig.js'
import {
  ConnectorAccountNotFound,
  ConnectorNotConnectedError,
} from '../errors/config.js'
import type {
  AccountParameter,
  ChainIdParameter,
  ConnectorParameter,
} from '../types/properties.js'
import type { Evaluate } from '../types/utils.js'

export type GetConnectorClientParameters<
  config extends Config = Config,
  chainId extends config['chains'][number]['id'] = config['chains'][number]['id'],
> = Evaluate<
  ChainIdParameter<config, chainId> & ConnectorParameter & AccountParameter
>

export type GetConnectorClientReturnType<
  config extends Config = Config,
  chainId extends config['chains'][number]['id'] = config['chains'][number]['id'],
> = Evaluate<
  Client<
    Transport,
    chainId extends config['chains'][number]['id']
      ? Extract<config['chains'][number], { id: chainId }>
      : config['chains'][number],
    Account
  >
>

export type GetConnectorClientError =
  | ConnectorAccountNotFound
  | ConnectorNotConnectedError
  | Error

/** https://alpha.wagmi.sh/core/actions/getConnectorClient */
export async function getConnectorClient<
  config extends Config,
  chainId extends config['chains'][number]['id'],
>(
  config: config,
  parameters: GetConnectorClientParameters<config, chainId> = {},
): Promise<GetConnectorClientReturnType<config, chainId>> {
  // Get connection
  let connection: Connection | undefined
  if (parameters.connector) {
    const { connector } = parameters
    const [accounts, chainId] = await Promise.all([
      connector.getAccounts(),
      connector.getChainId(),
    ])
    connection = {
      accounts: accounts as readonly [Address, ...Address[]],
      chainId,
      connector,
    }
  } else connection = config.state.connections.get(config.state.current!)
  if (!connection) throw new ConnectorNotConnectedError()

  const chainId = parameters.chainId ?? connection.chainId

  // If connector has custom `getClient` implementation
  type Return = GetConnectorClientReturnType<config, chainId>
  const connector = connection.connector
  if (connector.getClient)
    return connector.getClient({ chainId: chainId }) as unknown as Return

  // Default using `custom` transport
  const account = parseAccount(parameters.account ?? connection.accounts[0]!)
  const chain = config.chains.find((chain) => chain.id === chainId)
  const provider = (await connection.connector.getProvider({ chainId })) as {
    request(...args: any): Promise<any>
  }

  // if account was provided, check that it exists on the connector
  if (parameters.account && !connection.accounts.includes(account.address))
    throw new ConnectorAccountNotFound({ address: account.address, connector })

  return createClient({
    account,
    chain,
    name: 'Connector Client',
    transport: (opts) => custom(provider)({ ...opts, retryCount: 0 }),
  }) as unknown as Return
}
