// src/App.js
import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [form, setForm] = useState({
    height: '',
    weight: '',
    gender: 'female',
    style_tags: [],
    budget_total: 400,
    excluded_fabrics: [],
    occasions: []
  });

  const [wardrobe, setWardrobe] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleMultiSelect = (e, key) => {
    const values = Array.from(e.target.selectedOptions, option => option.value);
    setForm(prev => ({ ...prev, [key]: values }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:8000/generate_wardrobe', form);
      setWardrobe(response.data.capsule);
    } catch (err) {
      console.error('Error generating wardrobe:', err);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <h1>Capsule Wardrobe Builder</h1>
      <div className="form-group">
        <label>Height:</label>
        <input name="height" value={form.height} onChange={handleChange} />

        <label>Weight:</label>
        <input name="weight" value={form.weight} onChange={handleChange} type="number" />

        <label>Gender:</label>
        <select name="gender" value={form.gender} onChange={handleChange}>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="unisex">Unisex</option>
        </select>

        <label>Style Tags (Ctrl+Click to select multiple):</label>
        <select multiple onChange={(e) => handleMultiSelect(e, 'style_tags')}>
          <option value="minimalist">Minimalist</option>
          <option value="elegant">Elegant</option>
          <option value="casual">Casual</option>
          <option value="streetwear">Streetwear</option>
        </select>

        <label>Budget Total ($):</label>
        <input name="budget_total" type="number" value={form.budget_total} onChange={handleChange} />

        <label>Exclude Fabrics:</label>
        <select multiple onChange={(e) => handleMultiSelect(e, 'excluded_fabrics')}>
          <option value="wool">Wool</option>
          <option value="polyester">Polyester</option>
          <option value="leather">Leather</option>
        </select>

        <label>Occasions:</label>
        <select multiple onChange={(e) => handleMultiSelect(e, 'occasions')}>
          <option value="work">Work</option>
          <option value="casual">Casual</option>
          <option value="travel">Travel</option>
        </select>

        <button onClick={handleSubmit}>Generate Wardrobe</button>
      </div>

      {loading && <p>Loading...</p>}

      {wardrobe && (
        <div className="wardrobe-grid">
          <h2>Your Capsule Wardrobe:</h2>
          {wardrobe.map((item, index) => (
            <div key={index} className="item-card">
              <img src={item.ImageURL} alt={item.ItemType} width="150" />
              <p><strong>{item.ItemType}</strong></p>
              <p>{item.Materials}</p>
              <p>${item.Price}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;