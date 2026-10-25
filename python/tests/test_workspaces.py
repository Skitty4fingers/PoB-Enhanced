"""Workspaces: one live build per name (pob2.workspaces)."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from pob2 import mcp_server, workspaces
from pob2.web.app import WorkspaceMiddleware, create_app


@pytest.mark.parametrize("name", ["default", "scott", "bob-witch", "A1", " Mixed-Case "])
def test_valid_names(name):
    assert workspaces.normalize(name) == name.strip().lower()


@pytest.mark.parametrize("name", ["-dash", "has space", "dots.dots", "x" * 33, "../etc"])
def test_invalid_names(name):
    with pytest.raises(ValueError):
        workspaces.normalize(name)


def test_empty_name_is_default():
    assert workspaces.normalize(None) == workspaces.normalize("") == workspaces.DEFAULT


def test_store_folders(tmp_path):
    reg = workspaces.WorkspaceRegistry(tmp_path)
    assert reg.root_for("default") == tmp_path
    assert reg.root_for("bob") == tmp_path / "workspaces" / "bob"


def test_rest_reads_the_workspace(tmp_path, monkeypatch):
    monkeypatch.setattr(workspaces, "registry", workspaces.WorkspaceRegistry(tmp_path))
    with TestClient(create_app(with_mcp=False)) as c:
        assert c.get("/api/workspace").json() == {"name": "default"}
        assert c.get("/api/workspace", headers={"X-PoB-Workspace": "Bob"}).json() == {"name": "bob"}
        assert c.get("/api/workspace?w=alice").json() == {"name": "alice"}
        r = c.get("/api/workspace", headers={"X-PoB-Workspace": "no spaces"})
        assert r.status_code == 400 and "Workspace" in r.json()["error"]


def test_mcp_path_is_rewritten():
    seen = {}

    async def app(scope, receive, send):
        seen.update(path=scope["path"], query=scope["query_string"], workspace=workspaces.current_workspace.get())

    scope = {"type": "http", "path": "/w/Bob/mcp", "query_string": b"x=1", "headers": []}
    asyncio.run(WorkspaceMiddleware(app)(scope, None, None))
    assert seen == {"path": "/mcp", "query": b"x=1&w=Bob", "workspace": "bob"}


def test_mcp_reads_the_workspace():
    def ctx(request):
        return SimpleNamespace(request_context=SimpleNamespace(request=request))

    by_query = SimpleNamespace(query_params={"w": "alice"}, headers={})
    by_header = SimpleNamespace(query_params={}, headers={"x-pob-workspace": "bob"})
    assert mcp_server.request_workspace(ctx(by_query)) == "alice"
    assert mcp_server.request_workspace(ctx(by_header)) == "bob"
    assert mcp_server.request_workspace(ctx(None)) is None  # stdio
    assert mcp_server.request_workspace(None) is None


@pytest.mark.engine
def test_workspaces_are_independent_and_hibernate(tmp_path):
    reg = workspaces.WorkspaceRegistry(tmp_path, max_workers=1, idle_minutes=0)
    try:
        alice = reg.get("alice")
        alice.new_build(class_name="Ranger", level=50)
        alice.call("build.set_level", level=60)
        alice.save_build("Alice's ranger")

        bob = reg.get("bob")
        bob.new_build(class_name="Witch", level=10)
        # Over the limit of one worker: starting bob's hibernated alice.
        assert bob.engine.running and not alice.engine.running
        assert (tmp_path / "workspaces" / "alice" / "current.json").is_file()

        # Alice wakes up with her build, history and library; bob's are separate.
        info = reg.get("alice").info()
        assert info["className"] == "Ranger" and info["level"] == 60
        assert not bob.engine.running
        assert [b["name"] for b in alice.saved_builds()] == ["Alice's ranger"]
        assert bob.saved_builds() == []
        assert alice.undo()["undid"] == "Change level"
        assert alice.info()["level"] == 50
        assert reg.get("bob").info()["className"] == "Witch"
    finally:
        reg.shutdown()


@pytest.mark.engine
def test_heavy_worker_is_restarted(monkeypatch):
    from pob2 import service as service_module
    from pob2.service import PoBService

    monkeypatch.setattr(service_module, "SLOW_CALL_SECONDS", 0)
    monkeypatch.setenv("POB2_WORKER_MAX_MB", "1")  # every call counts as heavy and over the limit
    svc = PoBService()
    try:
        svc.new_build(class_name="Monk", level=33)
        assert not svc.engine.running  # restarted after the call
        info = svc.info()  # the next call brings the build back
        assert info["className"] == "Monk" and info["level"] == 33
        svc.set_character(level=40)
        assert svc.undo()["undid"] == "Change character"
        assert svc.info()["level"] == 33
    finally:
        svc.engine.stop()
