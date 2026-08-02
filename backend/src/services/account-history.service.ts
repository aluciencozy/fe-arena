import { emptyAccountHistory } from "../persistence/account-history.js";
import type { AccountHistory } from "../persistence/account-history.js";
import type { AccountHistoryRepository } from "../persistence/match.repository.js";

let repository: AccountHistoryRepository = { getAccountHistory: async () => emptyAccountHistory() };

export const setAccountHistoryRepository = (next: AccountHistoryRepository) => { repository = next; };
export const getAccountHistory = (authUserId: string): Promise<AccountHistory> => repository.getAccountHistory(authUserId);
