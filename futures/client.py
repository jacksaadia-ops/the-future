import base64
import json
import time

import requests

from futures import config


class ProjectXError(Exception):
    pass


class ProjectXClient:
    """Thin REST client for the TopstepX / ProjectX Gateway API
    (api.topstepx.com).

    Auth: POST /Auth/loginKey with {userName, apiKey} -> a bearer JWT good
    for ~24h. Endpoint paths, request bodies, and the bar-unit enum here are
    verified against ProjectX's public docs and the open-source
    project-x-py SDK; this has not yet been exercised against a live
    account from this session, so treat exact field names as the
    most-likely-correct starting point rather than gospel — the first live
    run is the real test.
    """

    def __init__(self, username=None, api_key=None, base_url=None):
        self._username = username or config.PROJECTX_USERNAME
        self._api_key = api_key or config.PROJECTX_API_KEY
        self._base_url = base_url or config.PROJECTX_API_BASE
        self._session = requests.Session()
        self._token = None
        self._token_expiry = 0

    def _login(self):
        resp = self._session.post(
            f"{self._base_url}/Auth/loginKey",
            json={"userName": self._username, "apiKey": self._api_key},
            headers={"accept": "text/plain", "Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success"):
            raise ProjectXError(
                f"ProjectX login failed: {body.get('errorMessage') or body.get('errorCode')}"
            )
        self._token = body["token"]
        self._token_expiry = self._decode_jwt_expiry(self._token)

    @staticmethod
    def _decode_jwt_expiry(token):
        try:
            payload_b64 = token.split(".")[1]
            padded = payload_b64 + "=" * (-len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded))
            return payload["exp"]
        except Exception:
            return time.time() + 3600  # conservative fallback if the token shape ever changes

    def _ensure_authenticated(self):
        if self._token is None or time.time() >= self._token_expiry - 300:
            self._login()

    @property
    def token(self):
        """Current bearer token, refreshing first if it's missing or close to expiry.

        Used directly by the realtime SignalR clients, which need the raw
        token for their `access_token` query param rather than a REST call.
        """
        self._ensure_authenticated()
        return self._token

    def _post(self, path, payload):
        self._ensure_authenticated()
        resp = self._session.post(
            f"{self._base_url}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success", True):
            # Temporary verbose logging while getting a first live account
            # connected — prints the exact request and response so a failure
            # can be diagnosed without guessing.
            print(f"[ProjectX] {path} request payload: {payload}")
            print(f"[ProjectX] {path} response body: {body}")
            raise ProjectXError(
                f"ProjectX request to {path} failed: {body.get('errorMessage') or body.get('errorCode')} "
                f"(full response: {body})"
            )
        return body

    def search_contracts(self, search_text, live=False):
        body = self._post("/Contract/search", {"searchText": search_text, "live": live})
        return body.get("contracts", [])

    def search_accounts(self, only_active=True):
        body = self._post("/Account/search", {"onlyActiveAccounts": only_active})
        return body.get("accounts", [])

    def retrieve_bars(
        self,
        contract_id,
        unit,
        unit_number,
        start_time,
        end_time,
        limit=1000,
        live=False,
        include_partial_bar=True,
    ):
        body = self._post(
            "/History/retrieveBars",
            {
                "contractId": contract_id,
                "live": live,
                "startTime": start_time,
                "endTime": end_time,
                "unit": unit,
                "unitNumber": unit_number,
                "limit": limit,
                "includePartialBar": include_partial_bar,
            },
        )
        return body.get("bars", [])
