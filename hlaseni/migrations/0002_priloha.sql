-- příloha hlášení: odkaz na pohled v mapě a malý snímek pohledu (data:image/jpeg;base64, nejvýš ~300 kB)
ALTER TABLE reports ADD COLUMN odkaz TEXT;
ALTER TABLE reports ADD COLUMN snimek TEXT;
