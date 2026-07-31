"""
SQLAlchemy 2.0 ORM models for the Fuel Station Finder AI backend.

Importing this package registers every model on ``app.core.database.Base.metadata``,
which is what Alembic and ``Base.metadata.create_all()`` rely on. Always add new
models here so they are picked up by migrations automatically.
"""

from app.core.database import Base
from app.models.fuel_station import FuelStation
from app.models.fuel_station_fuel_type import FuelStationFuelType
from app.models.fuel_type import FuelType, FuelTypeCode

__all__ = [
    "Base",
    "FuelStation",
    "FuelStationFuelType",
    "FuelType",
    "FuelTypeCode",
]
