"""Shared check for free text that is stored in PostgreSQL.

PostgreSQL text columns refuse the NUL character, which would otherwise surface as a 500. Rejecting it in the
request model turns it into a normal 422. Tabs, newlines and every other script (Telugu, emoji and so on) stay allowed.
"""
from pydantic import AfterValidator


def reject_nul(value):
    if value is not None and "\x00" in value:
        raise ValueError("unsupported_character")
    return value


NoNul = AfterValidator(reject_nul)
