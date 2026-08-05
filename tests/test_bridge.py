from kairos_admin.bridge import Api

def test_bridge_create_and_list(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "X", "sector": "dental",
        "owner": {"login_id": "x", "password": "p"},
        "features": {}, "catalog": None,
    })
    assert out["salon"]["slug"] == "x"
    assert len(api.list_tenants()) == 1

def test_bridge_errors_are_returned_not_raised(supa):
    api = Api(supa=supa)
    res = api.set_feature("S1", "feature_inexistente", True, None)
    assert "error" in res

def test_bridge_template(supa):
    api = Api(supa=supa)
    assert len(api.template("dental")["services"]) >= 3
